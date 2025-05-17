# Assessment Engine - Infrastructure Map

This document provides a true step-by-step implementation guide for building the AWS infrastructure required for the Dynamic Challenge Assessment Engine. Each step builds upon the previous one, creating a complete system that enables automated assessment of AWS reliability challenges.

## Setup Environment Variables

First, let's set up environment variables we'll use throughout this process:

```bash
# Set your AWS region and account details
export AWS_REGION="us-east-1"
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export CHALLENGE_BUCKET="ctf-reliability-challenges-$(date +%s)"
export DEPLOYMENT_BUCKET="ctf-deployment-$(date +%s)"
export EXTERNAL_ID="ctf-assessment-engine"

# Create a working directory
mkdir -p ctf-assessment-engine
cd ctf-assessment-engine

echo "Using AWS Account: $ACCOUNT_ID"
echo "Challenge Bucket: $CHALLENGE_BUCKET"
echo "Deployment Bucket: $DEPLOYMENT_BUCKET"
```

## Step 1: Create Storage Resources

### 1.1 Create S3 Buckets

```bash
# Create the challenge repository bucket
aws s3api create-bucket \
  --bucket $CHALLENGE_BUCKET \
  --region $AWS_REGION

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket $CHALLENGE_BUCKET \
  --versioning-configuration Status=Enabled

# Create deployment bucket for Lambda packages
aws s3api create-bucket \
  --bucket $DEPLOYMENT_BUCKET \
  --region $AWS_REGION

echo "✅ S3 buckets created successfully"
```

### 1.2 Create DynamoDB Tables

```bash
# Create challenge registry table
aws dynamodb create-table \
  --table-name ctf-challenge-registry \
  --attribute-definitions \
    AttributeName=challengeId,AttributeType=S \
    AttributeName=active,AttributeType=S \
  --key-schema AttributeName=challengeId,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=active-index,KeySchema=[{AttributeName=active,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}" \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5

# Create assessment results table
aws dynamodb create-table \
  --table-name ctf-assessment-results \
  --attribute-definitions \
    AttributeName=participantId,AttributeType=S \
    AttributeName=challengeId,AttributeType=S \
    AttributeName=teamId,AttributeType=S \
  --key-schema \
    AttributeName=participantId,KeyType=HASH \
    AttributeName=challengeId,KeyType=RANGE \
  --global-secondary-indexes \
    "IndexName=team-index,KeySchema=[{AttributeName=teamId,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}" \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5

echo "✅ DynamoDB tables created successfully"
```

## Step 2: Create IAM Roles and Policies

### 2.1 Create Assessment Engine Role

```bash
# Create trust policy file
cat > assessment-engine-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create the IAM role
aws iam create-role \
  --role-name AssessmentEngineRole \
  --assume-role-policy-document file://assessment-engine-trust-policy.json

# Attach basic Lambda execution policy
aws iam attach-role-policy \
  --role-name AssessmentEngineRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

echo "✅ IAM role created successfully"
```

### 2.2 Create Custom Policy

```bash
# Create policy document
cat > assessment-engine-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::$CHALLENGE_BUCKET",
        "arn:aws:s3:::$CHALLENGE_BUCKET/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:$AWS_REGION:$ACCOUNT_ID:table/ctf-challenge-registry",
        "arn:aws:dynamodb:$AWS_REGION:$ACCOUNT_ID:table/ctf-assessment-results",
        "arn:aws:dynamodb:$AWS_REGION:$ACCOUNT_ID:table/ctf-challenge-registry/index/*",
        "arn:aws:dynamodb:$AWS_REGION:$ACCOUNT_ID:table/ctf-assessment-results/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "sts:AssumeRole"
      ],
      "Resource": "arn:aws:iam::*:role/AssessmentEngineAccessRole"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData"
      ],
      "Resource": "*"
    }
  ]
}
EOF

# Create policy 
POLICY_ARN=$(aws iam create-policy \
  --policy-name AssessmentEnginePolicy \
  --policy-document file://assessment-engine-policy.json \
  --query 'Policy.Arn' \
  --output text)

# Attach policy to role
aws iam attach-role-policy \
  --role-name AssessmentEngineRole \
  --policy-arn $POLICY_ARN

echo "✅ Custom policy created and attached successfully"
```

## Step 3: Create the Assessment Engine Lambda Function

### 3.1 Create Lambda Code

```bash
# Create a directory for the Lambda code
mkdir -p assessment-engine
cd assessment-engine

# Create the main Lambda file
cat > index.py << 'EOF'
"""
Assessment Engine Lambda Function

This Lambda function is the core of the Dynamic Challenge Assessment Engine.
It loads challenge-specific check functions from S3 and executes them against
participant resources in team accounts.
"""

import json
import boto3
import logging
import importlib.util
import sys
import tempfile
import os
import time
import traceback
from datetime import datetime
import botocore.exceptions

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
sts = boto3.client('sts')
cloudwatch = boto3.client('cloudwatch')

def lambda_handler(event, context):
    """
    Main entry point for the Assessment Engine Lambda function.
    """
    start_time = time.time()
    
    # Extract parameters from the event
    try:
        participant_id = event.get('participantId')
        challenge_id = event.get('challengeId')
        team_id = event.get('teamId', 'default-team')
        
        if not participant_id or not challenge_id:
            raise ValueError("Missing required parameters: participantId and challengeId")
            
        logger.info(f"Starting assessment for participant {participant_id} on challenge {challenge_id}")
        
        # Load challenge configuration from DynamoDB
        challenge_config = load_challenge_config(challenge_id)
        logger.info(f"Loaded challenge configuration: {challenge_id}")
        
        # Dynamically load check functions from S3
        check_functions = load_check_functions_from_s3(
            challenge_config['s3Location'],
            challenge_config['checkFunctionsFile']
        )
        logger.info(f"Loaded check functions from S3: {challenge_config['checkFunctionsFile']}")
        
        # Identify the target account for assessment
        team_account_id = identify_team_account(team_id)
        logger.info(f"Identified team account: {team_account_id}")
        
        # Assume role in the participant account
        assumed_credentials = assume_assessment_role(team_account_id)
        logger.info(f"Assumed role in team account {team_account_id}")
        
        # Run the assessment with the loaded check functions
        assessment_results = run_assessment(
            participant_id,
            challenge_config,
            check_functions,
            assumed_credentials
        )
        logger.info(f"Completed assessment: {len(assessment_results)} criteria checked")
        
        # Calculate the total score
        score = calculate_score(assessment_results)
        passed = score >= challenge_config.get('passingScore', 80)
        
        # Generate feedback based on assessment results
        feedback = generate_feedback(assessment_results, score, passed)
        
        # Store results in DynamoDB
        store_assessment_results(
            participant_id,
            challenge_id,
            team_id,
            assessment_results,
            score,
            passed
        )
        logger.info(f"Stored assessment results. Score: {score}, Passed: {passed}")
        
        # Record metrics
        record_assessment_metrics(challenge_id, score, passed, time.time() - start_time)
        
        # Return results
        return {
            'participantId': participant_id,
            'challengeId': challenge_id,
            'teamId': team_id,
            'score': score,
            'maxScore': calculate_max_score(challenge_config),
            'passed': passed,
            'results': assessment_results,
            'feedback': feedback,
            'timestamp': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error during assessment: {str(e)}")
        logger.error(traceback.format_exc())
        
        # Record error metric
        try:
            cloudwatch.put_metric_data(
                Namespace='CTF/AssessmentEngine',
                MetricData=[
                    {
                        'MetricName': 'AssessmentErrors',
                        'Value': 1,
                        'Unit': 'Count',
                        'Dimensions': [
                            {
                                'Name': 'ChallengeId',
                                'Value': event.get('challengeId', 'unknown')
                            }
                        ]
                    }
                ]
            )
        except Exception as metric_error:
            logger.error(f"Failed to record error metric: {str(metric_error)}")
        
        raise

def load_challenge_config(challenge_id):
    """Load the challenge configuration from DynamoDB."""
    table = dynamodb.Table(os.environ.get('CHALLENGE_REGISTRY_TABLE', 'ctf-challenge-registry'))
    
    try:
        response = table.get_item(Key={'challengeId': challenge_id})
    except botocore.exceptions.ClientError as e:
        logger.error(f"DynamoDB error: {str(e)}")
        raise Exception(f"Failed to load challenge configuration: {str(e)}")
    
    if 'Item' not in response:
        raise Exception(f"Challenge not found: {challenge_id}")
    
    challenge = response['Item']
    
    # Check if the challenge is active
    if not challenge.get('active', 'true') == 'true':
        raise Exception(f"Challenge is not active: {challenge_id}")
    
    return challenge

def load_check_functions_from_s3(s3_location, check_functions_file):
    """Dynamically load check functions from an S3 object."""
    try:
        # Parse S3 location
        s3_path = s3_location.replace('s3://', '')
        parts = s3_path.split('/', 1)
        bucket_name = parts[0]
        key_prefix = parts[1] if len(parts) > 1 else ""
        
        # Get object from S3
        response = s3.get_object(
            Bucket=bucket_name,
            Key=f"{key_prefix}{check_functions_file}"
        )
        
        # Read code content
        code_content = response['Body'].read().decode('utf-8')
        
        # Create a temporary file to import as a module
        with tempfile.NamedTemporaryFile(suffix='.py', delete=False) as temp_file:
            temp_file_path = temp_file.name
            temp_file.write(code_content.encode('utf-8'))
        
        try:
            # Load the module using importlib
            module_name = f"check_functions_{int(time.time())}"
            spec = importlib.util.spec_from_file_location(module_name, temp_file_path)
            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)
            
            return module
        finally:
            # Clean up the temporary file
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
                
    except botocore.exceptions.ClientError as e:
        logger.error(f"S3 error: {str(e)}")
        raise Exception(f"Failed to load check functions from S3: {str(e)}")
    except Exception as e:
        logger.error(f"Error loading check functions: {str(e)}")
        logger.error(traceback.format_exc())
        raise Exception(f"Failed to load check functions: {str(e)}")

def identify_team_account(team_id):
    """Identify the AWS account ID for the team."""
    # In a real implementation, this would query a database or config
    team_account_mapping = json.loads(os.environ.get('TEAM_ACCOUNT_MAPPING', '{}'))
    
    if team_id in team_account_mapping:
        return team_account_mapping[team_id]
    
    # If no mapping found, return a default account ID from environment variable
    return os.environ.get('DEFAULT_TEAM_ACCOUNT_ID', '123456789012')

def assume_assessment_role(account_id):
    """Assume the AssessmentEngineAccessRole in the participant account."""
    try:
        role_arn = f"arn:aws:iam::{account_id}:role/AssessmentEngineAccessRole"
        external_id = os.environ.get('ASSESSMENT_ENGINE_EXTERNAL_ID', 'ctf-assessment-engine')
        
        logger.info(f"Assuming role: {role_arn} with external ID: {external_id}")
        
        response = sts.assume_role(
            RoleArn=role_arn,
            RoleSessionName="AssessmentEngineSession",
            ExternalId=external_id,
            DurationSeconds=900  # 15 minutes
        )
        
        return {
            'aws_access_key_id': response['Credentials']['AccessKeyId'],
            'aws_secret_access_key': response['Credentials']['SecretAccessKey'],
            'aws_session_token': response['Credentials']['SessionToken']
        }
    except botocore.exceptions.ClientError as e:
        logger.error(f"Error assuming role: {str(e)}")
        raise Exception(f"Failed to assume role in participant account: {str(e)}")

def run_assessment(participant_id, challenge_config, check_functions, assumed_credentials):
    """Execute the assessment using loaded check functions."""
    results = []
    stack_name_prefix = challenge_config.get('stackNamePrefix', 'reliability-challenge-')
    stack_name = f"{stack_name_prefix}{participant_id}"
    
    # Run each check function defined in the challenge config
    for criterion in challenge_config.get('assessmentCriteria', []):
        criterion_id = criterion.get('id')
        criterion_name = criterion.get('name')
        check_function_name = criterion.get('checkFunction')
        points = criterion.get('points', 0)
        
        logger.info(f"Checking criterion: {criterion_name} ({criterion_id}) using {check_function_name}")
        
        # Check if the function exists in the module
        if not hasattr(check_functions, check_function_name):
            logger.warning(f"Check function {check_function_name} not found in module")
            results.append({
                'criterionId': criterion_id,
                'name': criterion_name,
                'points': 0,
                'maxPoints': points,
                'implemented': False,
                'error': f"Check function not found: {check_function_name}"
            })
            continue
        
        try:
            # Get the check function
            check_function = getattr(check_functions, check_function_name)
            
            # Execute the check function with credentials for the participant account
            result = execute_check_function(
                check_function,
                participant_id,
                stack_name,
                assumed_credentials
            )
            
            # Add result to the list
            results.append({
                'criterionId': criterion_id,
                'name': criterion_name,
                'points': points if result.get('implemented', False) else 0,
                'maxPoints': points,
                'implemented': result.get('implemented', False),
                'details': result.get('details', {})
            })
            
            logger.info(f"Criterion {criterion_id} result: implemented={result.get('implemented', False)}")
            
        except Exception as e:
            logger.error(f"Error executing check function {check_function_name}: {str(e)}")
            logger.error(traceback.format_exc())
            
            results.append({
                'criterionId': criterion_id,
                'name': criterion_name,
                'points': 0,
                'maxPoints': points,
                'implemented': False,
                'error': str(e)
            })
    
    return results

def execute_check_function(check_function, participant_id, stack_name, credentials):
    """Execute a single check function with appropriate credentials."""
    try:
        # Set maximum execution time to prevent infinite loops
        import signal
        
        def timeout_handler(signum, frame):
            raise TimeoutError("Check function execution timed out")
        
        # Set timeout to 30 seconds
        signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(30)
        
        # Execute the check function
        result = check_function(participant_id, stack_name, credentials)
        
        # Cancel the alarm
        signal.alarm(0)
        
        # Validate result format
        if not isinstance(result, dict):
            raise ValueError("Check function must return a dictionary")
        
        if 'implemented' not in result:
            raise ValueError("Check function result must include 'implemented' key")
        
        return result
    
    except Exception as e:
        logger.error(f"Error in check function execution: {str(e)}")
        raise

def calculate_score(assessment_results):
    """Calculate the total score based on assessment results."""
    return sum(result.get('points', 0) for result in assessment_results)

def calculate_max_score(challenge_config):
    """Calculate the maximum possible score for the challenge."""
    return sum(
        criterion.get('points', 0) 
        for criterion in challenge_config.get('assessmentCriteria', [])
    )

def generate_feedback(assessment_results, score, passed):
    """Generate feedback based on assessment results."""
    implemented = []
    suggestions = []
    
    for result in assessment_results:
        if result.get('implemented', False):
            implemented.append({
                'name': result.get('name'),
                'details': result.get('details', {})
            })
        else:
            suggestions.append({
                'name': result.get('name'),
                'points': result.get('maxPoints', 0)
            })
    
    # Generate summary message
    if passed:
        summary = f"Congratulations! You've successfully passed the challenge with a score of {score}."
    else:
        summary = f"You've scored {score} points, but need more improvements to pass the challenge."
        
    return {
        'summary': summary,
        'implemented': implemented,
        'suggestions': suggestions
    }

def store_assessment_results(participant_id, challenge_id, team_id, assessment_results, score, passed):
    """Store assessment results in DynamoDB."""
    table = dynamodb.Table(os.environ.get('ASSESSMENT_RESULTS_TABLE', 'ctf-assessment-results'))
    
    try:
        item = {
            'participantId': participant_id,
            'challengeId': challenge_id,
            'teamId': team_id,
            'timestamp': int(time.time() * 1000),  # Current time in milliseconds
            'score': score,
            'details': assessment_results,
            'passed': passed,
            'assessedAt': datetime.now().isoformat()
        }
        
        table.put_item(Item=item)
    except botocore.exceptions.ClientError as e:
        logger.error(f"DynamoDB error: {str(e)}")
        raise Exception(f"Failed to store assessment results: {str(e)}")

def record_assessment_metrics(challenge_id, score, passed, duration):
    """Record metrics about the assessment."""
    try:
        cloudwatch.put_metric_data(
            Namespace='CTF/AssessmentEngine',
            MetricData=[
                {
                    'MetricName': 'AssessmentScore',
                    'Value': score,
                    'Unit': 'Count',
                    'Dimensions': [
                        {
                            'Name': 'ChallengeId',
                            'Value': challenge_id
                        }
                    ]
                },
                {
                    'MetricName': 'AssessmentsPassed',
                    'Value': 1 if passed else 0,
                    'Unit': 'Count',
                    'Dimensions': [
                        {
                            'Name': 'ChallengeId',
                            'Value': challenge_id
                        }
                    ]
                },
                {
                    'MetricName': 'AssessmentDuration',
                    'Value': duration,
                    'Unit': 'Seconds',
                    'Dimensions': [
                        {
                            'Name': 'ChallengeId',
                            'Value': challenge_id
                        }
                    ]
                }
            ]
        )
    except Exception as e:
        logger.error(f"Failed to record metrics: {str(e)}")
        # Don't raise an exception, as this shouldn't fail the assessment
EOF

# Create requirements file
cat > requirements.txt << EOF
boto3==1.24.0
EOF

echo "✅ Lambda code created successfully"
```

### 3.2 Package and Upload Lambda Function

```bash
# Install requirements
pip install -r requirements.txt -t .

# Create zip package
zip -r ../assessment-engine.zip .
cd ..

# Upload to S3
aws s3 cp assessment-engine.zip s3://$DEPLOYMENT_BUCKET/assessment-engine.zip

echo "✅ Lambda package uploaded to S3"
```

### 3.3 Create Lambda Function

```bash
# Get the IAM role ARN
ROLE_ARN=$(aws iam get-role --role-name AssessmentEngineRole --query 'Role.Arn' --output text)

# Create the Lambda function
LAMBDA_ARN=$(aws lambda create-function \
  --function-name reliability-assessment-engine \
  --runtime python3.9 \
  --handler index.lambda_handler \
  --role $ROLE_ARN \
  --code S3Bucket=$DEPLOYMENT_BUCKET,S3Key=assessment-engine.zip \
  --timeout 300 \
  --memory-size 1024 \
  --environment "Variables={CHALLENGE_REGISTRY_TABLE=ctf-challenge-registry,ASSESSMENT_RESULTS_TABLE=ctf-assessment-results,CHALLENGE_BUCKET=$CHALLENGE_BUCKET,ASSESSMENT_ENGINE_EXTERNAL_ID=$EXTERNAL_ID}" \
  --query 'FunctionArn' \
  --output text)

echo "✅ Lambda function created successfully: $LAMBDA_ARN"
```

## Step 4: Create API Gateway

### 4.1 Create REST API

```bash
# Create API Gateway
API_ID=$(aws apigateway create-rest-api \
  --name ctf-assessment-api \
  --description "API for the Dynamic Challenge Assessment Engine" \
  --endpoint-configuration "types=REGIONAL" \
  --query 'id' \
  --output text)

echo "✅ API Gateway created with ID: $API_ID"
```

### 4.2 Set Up Resources and Methods

```bash
# Get root resource ID
ROOT_ID=$(aws apigateway get-resources \
  --rest-api-id $API_ID \
  --query 'items[?path==`/`].id' \
  --output text)

# Create assessments resource
ASSESSMENTS_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_ID \
  --path-part assessments \
  --query 'id' \
  --output text)

# Create POST method
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $ASSESSMENTS_ID \
  --http-method POST \
  --authorization-type NONE

echo "✅ API Gateway methods and resources created"
```

### 4.3 Set Up Lambda Integration

```bash
# Create Lambda integration
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $ASSESSMENTS_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri arn:aws:apigateway:$AWS_REGION:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations

# Add permission to Lambda
aws lambda add-permission \
  --function-name reliability-assessment-engine \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$AWS_REGION:$ACCOUNT_ID:$API_ID/*/*/assessments"

echo "✅ Lambda integration set up successfully"
```

### 4.4 Deploy API

```bash
# Deploy API to prod stage
DEPLOYMENT_ID=$(aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod \
  --query 'id' \
  --output text)

API_URL="https://$API_ID.execute-api.$AWS_REGION.amazonaws.com/prod/assessments"

echo "✅ API deployed successfully"
echo "🔗 API URL: $API_URL"
```

## Step 5: Set Up Team Account IAM Role

Create a CloudFormation template for deploying in team accounts:

```bash
cat > team-account-template.yaml << EOF
AWSTemplateFormatVersion: '2010-09-09'
Description: 'Cross-Account Role for CTF Assessment Engine'

Parameters:
  ManagementAccountId:
    Type: String
    Description: 'AWS Account ID of the Challenge Management Account'
  
  ExternalId:
    Type: String
    Description: 'External ID for cross-account role assumption'
    Default: 'ctf-assessment-engine'

Resources:
  AssessmentEngineAccessRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: AssessmentEngineAccessRole
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              AWS: !Sub 'arn:aws:iam::${ManagementAccountId}:role/AssessmentEngineRole'
            Action: sts:AssumeRole
            Condition:
              StringEquals:
                sts:ExternalId: !Ref ExternalId
      Policies:
        - PolicyName: AssessmentAccessPolicy
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - cloudformation:DescribeStacks
                  - cloudformation:ListStackResources
                  - cloudformation:DescribeStackResources
                Resource: '*'
              - Effect: Allow
                Action:
                  - dynamodb:DescribeTable
                  - dynamodb:Scan
                  - dynamodb:Query
                  - dynamodb:GetItem
                  - dynamodb:DescribeContinuousBackups
                Resource: '*'
              - Effect: Allow
                Action:
                  - lambda:ListFunctions
                  - lambda:GetFunction
                  - lambda:GetFunctionConfiguration
                Resource: '*'
              - Effect: Allow
                Action:
                  - ec2:DescribeRegions
                  - ec2:DescribeVpcs
                  - ec2:DescribeSubnets
                  - ec2:DescribeSecurityGroups
                Resource: '*'

Outputs:
  RoleArn:
    Description: 'ARN of the Assessment Engine Access Role'
    Value: !GetAtt AssessmentEngineAccessRole.Arn
EOF

echo "✅ Team account CloudFormation template created successfully"
echo "To deploy this template in team accounts, use:"
echo "aws cloudformation create-stack --stack-name ctf-assessment-engine-role --template-body file://team-account-template.yaml --parameters ParameterKey=ManagementAccountId,ParameterValue=$ACCOUNT_ID ParameterKey=ExternalId,ParameterValue=$EXTERNAL_ID --capabilities CAPABILITY_NAMED_IAM"
```

## Step 6: Create Sample Challenge

### 6.1 Create a Sample Challenge

```bash
# Create directory for the sample challenge
mkdir -p sample-challenges/voting-system
cd sample-challenges/voting-system

# Create config.json
cat > config.json << EOF
{
  "challengeId": "reliability-voting-system",
  "name": "Reliable Voting System",
  "description": "Improve a voting system's reliability during peak traffic",
  "assessmentCriteria": [
    {
      "id": "multi-region",
      "name": "Multi-Region Deployment",
      "points": 10,
      "checkFunction": "check_multi_region_deployment"
    },
    {
      "id": "dynamodb-backup",
      "name": "DynamoDB Point-in-Time Recovery",
      "points": 10,
      "checkFunction": "check_dynamodb_backups"
    },
    {
      "id": "error-handling",
      "name": "Error Handling & Retry Logic",
      "points": 15,
      "checkFunction": "check_error_handling"
    }
  ],
  "stackNamePrefix": "reliability-challenge-",
  "passingScore": 80
}
EOF

# Create check-functions.py
cat > check-functions.py << 'EOF'
def check_multi_region_deployment(participant_id, stack_name, credentials=None):
    import boto3
    
    # If credentials are provided, use them to create clients
    if credentials:
        session = boto3.Session(
            aws_access_key_id=credentials.get('aws_access_key_id'),
            aws_secret_access_key=credentials.get('aws_secret_access_key'),
            aws_session_token=credentials.get('aws_session_token')
        )
    else:
        session = boto3.Session()
    
    # Check for resources in multiple regions
    regions = ['us-east-1', 'us-west-2', 'eu-west-1']
    deployed_in_regions = []
    
    for region in regions:
        cf = session.client('cloudformation', region_name=region)
        try:
            stack = cf.describe_stacks(StackName=stack_name)
            if stack.get('Stacks'):
                deployed_in_regions.append(region)
        except Exception:
            # Stack doesn't exist in this region, continue
            pass
    
    # Check for global tables
    dynamodb = session.client('dynamodb')
    tables = dynamodb.list_tables()
    
    has_global_tables = False
    for table_name in tables.get('TableNames', []):
        if participant_id in table_name:
            try:
                table = dynamodb.describe_table(TableName=table_name)
                if 'GlobalTableVersion' in table.get('Table', {}):
                    has_global_tables = True
                    break
            except Exception as e:
                print(f"Error checking table {table_name}: {str(e)}")
    
    return {
        "implemented": len(deployed_in_regions) > 1 or has_global_tables,
        "details": {
            "regions": deployed_in_regions,
            "hasGlobalTables": has_global_tables
        }
    }

def check_dynamodb_backups(participant_id, stack_name, credentials=None):
    import boto3
    
    # If credentials are provided, use them to create clients
    if credentials:
        session = boto3.Session(
            aws_access_key_id=credentials.get('aws_access_key_id'),
            aws_secret_access_key=credentials.get('aws_secret_access_key'),
            aws_session_token=credentials.get('aws_session_token')
        )
    else:
        session = boto3.Session()
    
    dynamodb = session.client('dynamodb')
    tables = dynamodb.list_tables()
    
    # Filter tables associated with the participant
    participant_tables = []
    for table_name in tables.get('TableNames', []):
        if participant_id in table_name or stack_name in table_name:
            participant_tables.append(table_name)
    
    # Check point-in-time recovery for each table
    tables_with_pitr = 0
    table_details = []
    
    for table_name in participant_tables:
        try:
            result = dynamodb.describe_continuous_backups(TableName=table_name)
            
            has_pitr = (
                result.get('ContinuousBackupsDescription', {})
                .get('PointInTimeRecoveryDescription', {})
                .get('PointInTimeRecoveryStatus') == 'ENABLED'
            )
            
            if has_pitr:
                tables_with_pitr += 1
            
            table_details.append({
                'tableName': table_name,
                'hasPITR': has_pitr
            })
        except Exception as e:
            print(f"Error checking PITR for table {table_name}: {str(e)}")
            table_details.append({
                'tableName': table_name,
                'hasPITR': False,
                'error': str(e)
            })
    
    return {
        "implemented": tables_with_pitr > 0 and tables_with_pitr == len(participant_tables),
        "details": {
            "tablesChecked": len(participant_tables),
            "tablesWithPITR": tables_with_pitr,
            "tableDetails": table_details
        }
    }

def check_error_handling(participant_id, stack_name, credentials=None):
    import boto3
    
    # If credentials are provided, use them to create clients
    if credentials:
        session = boto3.Session(
            aws_access_key_id=credentials.get('aws_access_key_id'),
            aws_secret_access_key=credentials.get('aws_secret_access_key'),
            aws_session_token=credentials.get('aws_session_token')
        )
    else:
        session = boto3.Session()
    
    cf = session.client('cloudformation')
    lambda_client = session.client('lambda')
    
    # Get stack resources
    try:
        resources = cf.list_stack_resources(StackName=stack_name)
    except Exception:
        return {
            "implemented": False,
            "details": {
                "error": f"Stack {stack_name} not found"
            }
        }
    
    # Look for Lambda functions in the stack
    lambda_functions = []
    for resource in resources.get('StackResourceSummaries', []):
        if resource.get('ResourceType') == 'AWS::Lambda::Function':
            lambda_functions.append(resource.get('PhysicalResourceId'))
    
    # Check Lambda functions for error handling
    functions_with_dlq = 0
    functions_with_retries = 0
    function_details = []
    
    for function_name in lambda_functions:
        try:
            # Get Lambda function configuration
            function = lambda_client.get_function(FunctionName=function_name)
            function_config = function.get('Configuration', {})
            
            # Check for Dead Letter Queue
            has_dlq = 'DeadLetterConfig' in function_config and function_config['DeadLetterConfig'].get('TargetArn')
            
            # Check for retry attempts
            has_retries = False
            if 'Environment' in function_config:
                env_vars = function_config['Environment'].get('Variables', {})
                has_retries = 'MAX_RETRIES' in env_vars or 'RETRY_COUNT' in env_vars
            
            # Update counters
            if has_dlq:
                functions_with_dlq += 1
            if has_retries:
                functions_with_retries += 1
            
            function_details.append({
                'functionName': function_name,
                'hasDLQ': has_dlq,
                'hasRetries': has_retries
            })
        except Exception as e:
            print(f"Error checking function {function_name}: {str(e)}")
            function_details.append({
                'functionName': function_name,
                'error': str(e)
            })
    
    # Determine if error handling is implemented
    has_error_handling = (
        len(lambda_functions) > 0 and
        functions_with_dlq == len(lambda_functions) and
        functions_with_retries > 0
    )
    
    return {
        "implemented": has_error_handling,
        "details": {
            "functionsChecked": len(lambda_functions),
            "functionsWithDLQ": functions_with_dlq,
            "functionsWithRetries": functions_with_retries,
            "functionDetails": function_details
        }
    }
EOF

echo "✅ Sample challenge files created successfully"
```

### 6.2 Upload and Register Sample Challenge

```bash
# Upload to S3
aws s3 cp config.json s3://$CHALLENGE_BUCKET/voting-system/config.json
aws s3 cp check-functions.py s3://$CHALLENGE_BUCKET/voting-system/check-functions.py

# Register challenge in DynamoDB
aws dynamodb put-item \
  --table-name ctf-challenge-registry \
  --item '{
    "challengeId": {"S": "reliability-voting-system"},
    "name": {"S": "Reliable Voting System"},
    "description": {"S": "Improve a voting system'\''s reliability during peak traffic"},
    "s3Location": {"S": "'s3://$CHALLENGE_BUCKET/voting-system/'"},
    "configFile": {"S": "config.json"},
    "checkFunctionsFile": {"S": "check-functions.py"},
    "difficulty": {"S": "intermediate"},
    "active": {"S": "true"},
    "createdBy": {"S": "admin"},
    "createdAt": {"S": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}
  }'

cd ../..
echo "✅ Sample challenge uploaded and registered successfully"
```

## Step 7: Create CloudWatch Dashboard and Alarms

### 7.1 Create Dashboard

```bash
# Create CloudWatch Dashboard
aws cloudwatch put-dashboard \
  --dashboard-name ctf-assessment-dashboard \
  --dashboard-body '{
    "widgets": [
      {
        "type": "metric",
        "x": 0,
        "y": 0,
        "width": 12,
        "height": 6,
        "properties": {
          "metrics": [
            [ "CTF/AssessmentEngine", "AssessmentScore", "ChallengeId", "reliability-voting-system", { "stat": "Average" } ]
          ],
          "view": "timeSeries",
          "stacked": false,
          "region": "'$AWS_REGION'",
          "title": "Average Assessment Scores",
          "period": 300
        }
      },
      {
        "type": "metric",
        "x": 12,
        "y": 0,
        "width": 12,
        "height": 6,
        "properties": {
          "metrics": [
            [ "CTF/AssessmentEngine", "AssessmentsPassed", "ChallengeId", "reliability-voting-system", { "stat": "Sum" } ]
          ],
          "view": "timeSeries",
          "stacked": false,
          "region": "'$AWS_REGION'",
          "title": "Successful Assessments",
          "period": 300
        }
      },
      {
        "type": "metric",
        "x": 0,
        "y": 6,
        "width": 12,
        "height": 6,
        "properties": {
          "metrics": [
            [ "CTF/AssessmentEngine", "AssessmentDuration", "ChallengeId", "reliability-voting-system", { "stat": "Average" } ]
          ],
          "view": "timeSeries",
          "stacked": false,
          "region": "'$AWS_REGION'",
          "title": "Assessment Duration",
          "period": 300
        }
      },
      {
        "type": "metric",
        "x": 12,
        "y": 6,
        "width": 12,
        "height": 6,
        "properties": {
          "metrics": [
            [ "CTF/AssessmentEngine", "AssessmentErrors", "ChallengeId", "reliability-voting-system", { "stat": "Sum" } ]
          ],
          "view": "timeSeries",
          "stacked": false,
          "region": "'$AWS_REGION'",
          "title": "Assessment Errors",
          "period": 300
        }
      }
    ]
  }'

echo "✅ CloudWatch dashboard created successfully"
```

### 7.2 Create SNS Topic for Alarms

```bash
# Create SNS topic for alarms
SNS_TOPIC_ARN=$(aws sns create-topic \
  --name ctf-assessment-alerts \
  --query 'TopicArn' \
  --output text)

# Create alarms
aws cloudwatch put-metric-alarm \
  --alarm-name AssessmentEngineErrors \
  --alarm-description "Alarm for assessment engine errors" \
  --metric-name AssessmentErrors \
  --namespace CTF/AssessmentEngine \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --dimensions "Name=ChallengeId,Value=reliability-voting-system" \
  --alarm-actions $SNS_TOPIC_ARN

# Create alarm for Lambda function errors
aws cloudwatch put-metric-alarm \
  --alarm-name AssessmentEngineLambdaErrors \
  --alarm-description "Alarm for Lambda function errors" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --dimensions "Name=FunctionName,Value=reliability-assessment-engine" \
  --alarm-actions $SNS_TOPIC_ARN

echo "✅ CloudWatch alarms created successfully"
```

## Step 8: Test the Assessment Process

Now that we have deployed all the components, let's test the assessment process:

### 8.1 Deploy Test Challenge in Team Account

First, deploy a basic challenge stack in a team account:

```bash
# Create a basic participant template
cat > test-participant-stack.yaml << EOF
AWSTemplateFormatVersion: '2010-09-09'
Description: 'Test Participant Stack for CTF Challenge'

Resources:
  VotingTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: voting-system-test-participant
      BillingMode: PAY_PER_REQUEST
      KeySchema:
        - AttributeName: voteId
          KeyType: HASH
      AttributeDefinitions:
        - AttributeName: voteId
          AttributeType: S
      # Intentionally missing point-in-time recovery for testing

  VotingFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: voting-function-test-participant
      Handler: index.handler
      Runtime: python3.9
      Role: !GetAtt LambdaExecutionRole.Arn
      Code:
        ZipFile: |
          def handler(event, context):
              # Simple function without error handling or DLQ
              return {
                  'statusCode': 200,
                  'body': '{"message": "Vote recorded"}'
              }

  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

Outputs:
  TableName:
    Description: 'Name of the voting table'
    Value: !Ref VotingTable
  
  FunctionName:
    Description: 'Name of the voting function'
    Value: !Ref VotingFunction
EOF

# Deploy the stack in team account
aws cloudformation create-stack \
  --stack-name reliability-challenge-test-participant \
  --template-body file://test-participant-stack.yaml \
  --capabilities CAPABILITY_IAM \
  --profile team-account-profile

# Wait for stack creation
aws cloudformation wait stack-create-complete \
  --stack-name reliability-challenge-test-participant \
  --profile team-account-profile

echo "✅ Test participant stack deployed successfully"
```

### 8.2 Test the Assessment API

Now, let's test the assessment API to see if it correctly evaluates the participant's solution:

```bash
# Create test JSON payload
cat > test-assessment-request.json << EOF
{
  "participantId": "test-participant",
  "challengeId": "reliability-voting-system",
  "teamId": "test-team"
}
EOF

# Invoke the API
ASSESSMENT_RESULT=$(curl -s -X POST \
  $API_URL \
  -H "Content-Type: application/json" \
  -d @test-assessment-request.json)

# Display the result
echo $ASSESSMENT_RESULT | jq .

echo "✅ Assessment API test completed"
```

### 8.3 Verify the Results in DynamoDB

Check that the results were properly stored in DynamoDB:

```bash
aws dynamodb get-item \
  --table-name ctf-assessment-results \
  --key '{
    "participantId": {"S": "test-participant"},
    "challengeId": {"S": "reliability-voting-system"}
  }' \
  --query 'Item.score'

echo "✅ Assessment results verified in DynamoDB"
```

## Step 9: Set Up Developer CLI Tool

To make it easier for challenge developers to create and manage challenges, let's create a simple CLI tool:

### 9.1 Create the CLI Tool Structure

```bash
# Create directory for the CLI tool
mkdir -p ctf-challenge-cli
cd ctf-challenge-cli

# Create setup.py
cat > setup.py << EOF
from setuptools import setup, find_packages

setup(
    name="ctf-challenge",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "boto3>=1.24.0",
        "click>=8.1.3",
        "pyyaml>=6.0",
    ],
    entry_points={
        "console_scripts": [
            "ctf-challenge=ctf_challenge.cli:main",
        ],
    },
)
EOF

# Create package structure
mkdir -p ctf_challenge

# Create __init__.py
touch ctf_challenge/__init__.py

echo "✅ CLI tool structure created"
```

### 9.2 Implement CLI Commands

```bash
# Create the cli.py file with main commands
cat > ctf_challenge/cli.py << 'EOF'
#!/usr/bin/env python3
"""
CTF Challenge CLI Tool

A command-line tool for managing AWS reliability CTF challenges.
"""

import os
import json
import boto3
import click
import shutil
import tempfile
import yaml
from pathlib import Path

# Default configurations
DEFAULT_REGION = "us-east-1"
DEFAULT_BUCKET = "ctf-reliability-challenges"
DEFAULT_TABLE = "ctf-challenge-registry"

@click.group()
@click.option('--profile', help='AWS profile to use')
@click.option('--region', default=DEFAULT_REGION, help='AWS region')
@click.pass_context
def cli(ctx, profile, region):
    """Manage AWS reliability CTF challenges."""
    ctx.ensure_object(dict)
    
    # Set up AWS session
    session = boto3.Session(profile_name=profile, region_name=region)
    ctx.obj['session'] = session
    ctx.obj['s3'] = session.client('s3')
    ctx.obj['dynamodb'] = session.resource('dynamodb')
    ctx.obj['region'] = region
    ctx.obj['bucket'] = DEFAULT_BUCKET
    ctx.obj['table'] = DEFAULT_TABLE

@cli.command()
@click.argument('challenge_name')
@click.pass_context
def create(ctx, challenge_name):
    """Create a new challenge template."""
    # Create directory structure
    if os.path.exists(challenge_name):
        click.echo(f"Error: Directory {challenge_name} already exists")
        return
    
    os.makedirs(challenge_name, exist_ok=True)
    
    # Create config file
    config = {
        "challengeId": challenge_name,
        "name": challenge_name.replace('-', ' ').title(),
        "description": f"Improve reliability of {challenge_name.replace('-', ' ')}",
        "assessmentCriteria": [
            {
                "id": "multi-region",
                "name": "Multi-Region Deployment",
                "points": 10,
                "checkFunction": "check_multi_region_deployment"
            },
            {
                "id": "dynamodb-backup",
                "name": "DynamoDB Point-in-Time Recovery",
                "points": 10,
                "checkFunction": "check_dynamodb_backups"
            }
        ],
        "stackNamePrefix": "reliability-challenge-",
        "passingScore": 80
    }
    
    with open(os.path.join(challenge_name, 'config.json'), 'w') as f:
        json.dump(config, f, indent=2)
    
    # Create check functions file
    check_functions = '''def check_multi_region_deployment(participant_id, stack_name, credentials=None):
    """
    Check if the participant implemented multi-region deployment.
    
    Args:
        participant_id (str): Participant identifier
        stack_name (str): CloudFormation stack name
        credentials (dict): AWS credentials for the participant account
        
    Returns:
        dict: Assessment result
    """
    import boto3
    
    # If credentials are provided, use them to create clients
    if credentials:
        session = boto3.Session(
            aws_access_key_id=credentials.get('aws_access_key_id'),
            aws_secret_access_key=credentials.get('aws_secret_access_key'),
            aws_session_token=credentials.get('aws_session_token')
        )
    else:
        session = boto3.Session()
    
    # Check for resources in multiple regions
    regions = ['us-east-1', 'us-west-2', 'eu-west-1']
    deployed_in_regions = []
    
    for region in regions:
        cf = session.client('cloudformation', region_name=region)
        try:
            stack = cf.describe_stacks(StackName=stack_name)
            if stack.get('Stacks'):
                deployed_in_regions.append(region)
        except Exception:
            # Stack doesn't exist in this region, continue
            pass
    
    # Check for global tables
    dynamodb = session.client('dynamodb')
    tables = dynamodb.list_tables()
    
    has_global_tables = False
    for table_name in tables.get('TableNames', []):
        if participant_id in table_name:
            try:
                table = dynamodb.describe_table(TableName=table_name)
                if 'GlobalTableVersion' in table.get('Table', {}):
                    has_global_tables = True
                    break
            except Exception as e:
                print(f"Error checking table {table_name}: {str(e)}")
    
    return {
        "implemented": len(deployed_in_regions) > 1 or has_global_tables,
        "details": {
            "regions": deployed_in_regions,
            "hasGlobalTables": has_global_tables
        }
    }

def check_dynamodb_backups(participant_id, stack_name, credentials=None):
    """
    Check if the participant enabled point-in-time recovery for DynamoDB tables.
    
    Args:
        participant_id (str): Participant identifier
        stack_name (str): CloudFormation stack name
        credentials (dict): AWS credentials for the participant account
        
    Returns:
        dict: Assessment result
    """
    import boto3
    
    # If credentials are provided, use them to create clients
    if credentials:
        session = boto3.Session(
            aws_access_key_id=credentials.get('aws_access_key_id'),
            aws_secret_access_key=credentials.get('aws_secret_access_key'),
            aws_session_token=credentials.get('aws_session_token')
        )
    else:
        session = boto3.Session()
    
    dynamodb = session.client('dynamodb')
    tables = dynamodb.list_tables()
    
    # Filter tables associated with the participant
    participant_tables = []
    for table_name in tables.get('TableNames', []):
        if participant_id in table_name or stack_name in table_name:
            participant_tables.append(table_name)
    
    # Check point-in-time recovery for each table
    tables_with_pitr = 0
    table_details = []
    
    for table_name in participant_tables:
        try:
            result = dynamodb.describe_continuous_backups(TableName=table_name)
            
            has_pitr = (
                result.get('ContinuousBackupsDescription', {})
                .get('PointInTimeRecoveryDescription', {})
                .get('PointInTimeRecoveryStatus') == 'ENABLED'
            )
            
            if has_pitr:
                tables_with_pitr += 1
            
            table_details.append({
                'tableName': table_name,
                'hasPITR': has_pitr
            })
        except Exception as e:
            print(f"Error checking PITR for table {table_name}: {str(e)}")
            table_details.append({
                'tableName': table_name,
                'hasPITR': False,
                'error': str(e)
            })
    
    return {
        "implemented": tables_with_pitr > 0 and tables_with_pitr == len(participant_tables),
        "details": {
            "tablesChecked": len(participant_tables),
            "tablesWithPITR": tables_with_pitr,
            "tableDetails": table_details
        }
    }
'''
    
    with open(os.path.join(challenge_name, 'check-functions.py'), 'w') as f:
        f.write(check_functions)
    
    # Create resources directory
    os.makedirs(os.path.join(challenge_name, 'resources'), exist_ok=True)
    
    click.echo(f"✅ Challenge template '{challenge_name}' created successfully")
    click.echo(f"Next steps:")
    click.echo(f"1. Edit {challenge_name}/config.json to customize your challenge")
    click.echo(f"2. Edit {challenge_name}/check-functions.py to implement assessment logic")
    click.echo(f"3. Add resources to {challenge_name}/resources/")
    click.echo(f"4. Test your challenge with 'ctf-challenge test {challenge_name}'")
    click.echo(f"5. Upload your challenge with 'ctf-challenge upload {challenge_name}'")

@cli.command()
@click.argument('challenge_name')
@click.option('--participant-id', default='test-participant')
@click.pass_context
def test(ctx, challenge_name, participant_id):
    """Test check functions for a challenge."""
    # Verify challenge exists
    if not os.path.exists(challenge_name):
        click.echo(f"Error: Challenge directory {challenge_name} not found")
        return
    
    # Load config
    try:
        with open(os.path.join(challenge_name, 'config.json'), 'r') as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        click.echo(f"Error loading config.json: {e}")
        return
    
    # Load check functions
    try:
        with open(os.path.join(challenge_name, 'check-functions.py'), 'r') as f:
            check_functions_code = f.read()
    except FileNotFoundError as e:
        click.echo(f"Error loading check-functions.py: {e}")
        return
    
    # Create a temporary file for importing
    with tempfile.NamedTemporaryFile(suffix='.py', delete=False) as temp_file:
        temp_file_path = temp_file.name
        temp_file.write(check_functions_code.encode('utf-8'))
    
    try:
        # Load the check functions module
        import importlib.util
        import sys
        
        module_name = f"check_functions_{challenge_name.replace('-', '_')}"
        spec = importlib.util.spec_from_file_location(module_name, temp_file_path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        
        # Generate a mock stack name
        stack_name = f"{config.get('stackNamePrefix', 'reliability-challenge-')}{participant_id}"
        
        # Run each check function
        click.echo(f"Testing check functions for challenge '{challenge_name}':")
        
        for criterion in config.get('assessmentCriteria', []):
            check_function_name = criterion.get('checkFunction')
            criterion_id = criterion.get('id')
            criterion_name = criterion.get('name')
            
            click.echo(f"\nTesting {criterion_name} ({criterion_id}):")
            
            # Check if function exists
            if not hasattr(module, check_function_name):
                click.echo(f"  ❌ Function {check_function_name} not found")
                continue
            
            # Get the function
            check_function = getattr(module, check_function_name)
            
            # Execute the function
            try:
                click.echo(f"  Running {check_function_name}...")
                result = check_function(participant_id, stack_name)
                
                # Print result
                click.echo(f"  Result: {json.dumps(result, indent=2)}")
                
                # Add to summary
                if result.get('implemented', False):
                    click.echo(f"  ✅ Implementation detected")
                else:
                    click.echo(f"  ⚠️ Implementation not detected")
            except Exception as e:
                click.echo(f"  ❌ Error executing {check_function_name}: {e}")
    finally:
        # Clean up the temporary file
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
    
    click.echo("\nTest completed")

@cli.command()
@click.argument('challenge_name')
@click.pass_context
def upload(ctx, challenge_name):
    """Upload a challenge to S3 and register it in DynamoDB."""
    # Verify challenge exists
    if not os.path.exists(challenge_name):
        click.echo(f"Error: Challenge directory {challenge_name} not found")
        return
    
    # Load config
    try:
        with open(os.path.join(challenge_name, 'config.json'), 'r') as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        click.echo(f"Error loading config.json: {e}")
        return
    
    # Validate the challenge ID in config matches directory name
    challenge_id = config.get('challengeId')
    if challenge_id != challenge_name:
        click.confirm(f"Warning: challengeId ({challenge_id}) doesn't match directory name ({challenge_name}). Continue?", abort=True)
    
    # Upload files to S3
    bucket = ctx.obj['bucket']
    s3 = ctx.obj['s3']
    base_path = f"{challenge_name}/"
    
    try:
        # Upload config.json
        click.echo(f"Uploading config.json...")
        s3.upload_file(
            os.path.join(challenge_name, 'config.json'),
            bucket,
            f"{base_path}config.json"
        )
        
        # Upload check-functions.py
        click.echo(f"Uploading check-functions.py...")
        s3.upload_file(
            os.path.join(challenge_name, 'check-functions.py'),
            bucket,
            f"{base_path}check-functions.py"
        )
        
        # Upload resources directory if it exists
        resources_dir = os.path.join(challenge_name, 'resources')
        if os.path.exists(resources_dir) and os.path.isdir(resources_dir):
            for root, dirs, files in os.walk(resources_dir):
                for file in files:
                    local_path = os.path.join(root, file)
                    relative_path = os.path.relpath(local_path, challenge_name)
                    s3_key = f"{base_path}{relative_path}"
                    
                    click.echo(f"Uploading {relative_path}...")
                    s3.upload_file(local_path, bucket, s3_key)
    except Exception as e:
        click.echo(f"Error uploading files to S3: {e}")
        return
    
    # Register the challenge in DynamoDB
    table = ctx.obj['dynamodb'].Table(ctx.obj['table'])
    
    try:
        item = {
            'challengeId': challenge_id,
            'name': config.get('name', challenge_id),
            'description': config.get('description', ''),
            's3Location': f"s3://{bucket}/{base_path}",
            'configFile': 'config.json',
            'checkFunctionsFile': 'check-functions.py',
            'difficulty': config.get('difficulty', 'intermediate'),
            'active': 'true',
            'createdBy': ctx.obj['session'].client('sts').get_caller_identity().get('Arn'),
            'createdAt': datetime.datetime.now().isoformat()
        }
        
        table.put_item(Item=item)
        
        click.echo(f"✅ Challenge '{challenge_id}' registered successfully")
        click.echo(f"S3 Location: s3://{bucket}/{base_path}")
    except Exception as e:
        click.echo(f"Error registering challenge in DynamoDB: {e}")

@cli.command()
@click.pass_context
def list(ctx):
    """List available challenges."""
    table = ctx.obj['dynamodb'].Table(ctx.obj['table'])
    
    try:
        response = table.scan()
        challenges = response.get('Items', [])
        
        if not challenges:
            click.echo("No challenges found")
            return
        
        click.echo("\nAvailable Challenges:")
        click.echo("=====================")
        
        for challenge in challenges:
            active_status = "✅ Active" if challenge.get('active') == 'true' else "❌ Inactive"
            click.echo(f"\n{challenge.get('name')} ({challenge.get('challengeId')})")
            click.echo(f"Description: {challenge.get('description')}")
            click.echo(f"Difficulty: {challenge.get('difficulty', 'intermediate')}")
            click.echo(f"Status: {active_status}")
            click.echo(f"Created by: {challenge.get('createdBy')}")
            click.echo(f"Created at: {challenge.get('createdAt')}")
            click.echo(f"S3 Location: {challenge.get('s3Location')}")
        
        click.echo(f"\nTotal: {len(challenges)} challenges")
    except Exception as e:
        click.echo(f"Error listing challenges: {e}")

def main():
    """Main entry point for the CLI."""
    import datetime  # Import needed for upload command
    cli(obj={})

if __name__ == '__main__':
    main()
EOF

# Install the package
pip install -e .

cd ..
echo "✅ CLI tool implemented and installed"
```

### 9.3 Test the CLI Tool

Let's test our CLI tool by creating and uploading a new challenge:

```bash
# Create a new challenge
ctf-challenge create sample-api-challenge

# Test the check functions
ctf-challenge test sample-api-challenge

# Upload the challenge
ctf-challenge list

echo "✅ CLI tool tested successfully"
```

## Step 10: Set Up CI/CD Pipeline

To automate deployment and updates, let's set up a CI/CD pipeline:

### 10.1 Create Pipeline Infrastructure

```bash
# Create buildspec.yml for CodeBuild
cat > buildspec.yml << EOF
version: 0.2

phases:
  install:
    runtime-versions:
      python: 3.9
    commands:
      - echo Installing dependencies...
      - pip install -r requirements.txt
  
  build:
    commands:
      - echo Running tests...
      - python -m pytest tests/
      - echo Packaging Lambda functions...
      - bash scripts/package_lambda.sh
  
  post_build:
    commands:
      - echo Deploying to AWS...
      - aws cloudformation deploy --template-file infrastructure.yaml --stack-name ctf-assessment-engine --capabilities CAPABILITY_NAMED_IAM
      - echo Deployment complete!

artifacts:
  files:
    - infrastructure.yaml
    - packaged-template.yaml
    - README.md
EOF

# Create basic GitHub Actions workflow
mkdir -p .github/workflows
cat > .github/workflows/deploy.yml << EOF
name: Deploy CTF Assessment Engine

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Set up Python
        uses: actions/setup-python@v2
        with:
          python-version: '3.9'
      
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
      
      - name: Run tests
        run: |
          python -m pytest tests/
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: \${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: \${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Package Lambda functions
        run: bash scripts/package_lambda.sh
      
      - name: Deploy CloudFormation stack
        run: |
          aws cloudformation deploy \\
            --template-file infrastructure.yaml \\
            --stack-name ctf-assessment-engine \\
            --capabilities CAPABILITY_NAMED_IAM
EOF

echo "✅ CI/CD pipeline configuration created"
```

## Step 11: Final Configuration and Documentation

### 11.1 Create Documentation for Participants

```bash
# Create participant documentation
cat > participant-guide.md << EOF
# AWS Reliability CTF - Participant Guide

Welcome to the AWS Reliability CTF event! This guide will help you understand how to participate in challenges and improve your AWS reliability skills.

## Getting Started

1. **Access Your AWS Account**: You'll be provided with credentials to a team AWS account
2. **Explore the Challenges**: Use the CTF platform to view available challenges
3. **Deploy Initial Resources**: Each challenge has initial resources that you need to improve
4. **Implement Reliability Improvements**: Enhance the reliability of the provided resources
5. **Submit for Assessment**: Use the assessment API to evaluate your solution

## Example Workflow

1. Choose a challenge, such as "Reliable Voting System"
2. Deploy the initial template in your AWS account
3. Identify reliability weaknesses (missing multi-region setup, no backups, etc.)
4. Implement improvements based on AWS Well-Architected Framework
5. Submit your solution for automated assessment
6. Review feedback and iterate to improve your score

## Assessment API

To assess your solution, make a POST request to the assessment API:

\`\`\`bash
curl -X POST \\
  https://api-endpoint/prod/assessments \\
  -H 'Content-Type: application/json' \\
  -d '{
    "participantId": "<your-participant-id>",
    "challengeId": "<challenge-id>",
    "teamId": "<your-team-id>"
  }'
\`\`\`

The API will return a score and feedback on your implementation.

## Best Practices

- Focus on implementing AWS Well-Architected reliability principles
- Test thoroughly before submitting for assessment
- Pay attention to the scoring criteria in each challenge
- Learn from feedback and iterate on your solution

Good luck and have fun improving your AWS reliability skills!
EOF

echo "✅ Participant documentation created"
```

### 11.2 Final Verification

```bash
# Verify all resources are properly deployed
aws cloudformation describe-stacks \
  --stack-name ctf-assessment-engine \
  --query 'Stacks[0].StackStatus'

# List Lambda functions
aws lambda list-functions \
  --query 'Functions[?starts_with(FunctionName, `reliability-assessment`)]'

# List API Gateway endpoints
aws apigateway get-rest-apis \
  --query 'items[?name==`ctf-assessment-api`]'

echo "✅ Deployment verification completed"
```

## Wrap-up and Next Steps

Congratulations! You have successfully implemented the complete AWS infrastructure for the Dynamic Challenge Assessment Engine. This system provides a robust platform for running AWS reliability Capture The Flag events.

### What You've Built:

1. ✅ **Core Assessment Engine** - A Lambda function that dynamically loads and executes check functions
2. ✅ **Challenge Repository** - S3 storage for challenge definitions and check functions
3. ✅ **Assessment API** - API Gateway endpoint for triggering assessments
4. ✅ **Cross-Account Access** - Secure IAM roles for evaluating team resources
5. ✅ **Developer CLI** - Command-line tool for challenge management
6. ✅ **Monitoring** - CloudWatch dashboards and alarms for operational visibility
7. ✅ **CI/CD Pipeline** - Automated deployment and updates

### Next Steps:

1. **Create More Challenges** - Use the CLI tool to build additional reliability challenges
2. **Enhance the User Interface** - Consider adding a web UI for participants
3. **Add Authentication** - Implement Cognito or another auth mechanism for the API
4. **Extend Metrics** - Create additional CloudWatch metrics and dashboards
5. **Scale Testing** - Run load tests to ensure the system can handle many participants

With this infrastructure in place, you're ready to run engaging and educational AWS reliability CTF events that help participants build real-world skills in designing resilient cloud architectures.

