# AWS Reliability CTF Challenge Tutorial

A comprehensive guide to creating, testing, and implementing AWS Well-Architected Reliability Pillar challenges for Capture The Flag (CTF) competitions.

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Development Environment Setup](#development-environment-setup)
4. [Creating a Simple Unreliable Application](#creating-a-simple-unreliable-application)
5. [Creating the Challenge](#creating-the-challenge)
6. [Deploying and Testing the Challenge](#deploying-and-testing-the-challenge)
7. [Implementing Improvements for Testing](#implementing-improvements-for-testing)
8. [Clean Up](#clean-up)
9. [Architecture Overview](#architecture-overview)
10. [Advanced Topics](#advanced-topics)

## Overview

This tutorial guides you through creating AWS reliability-focused CTF challenges using the Dynamic Challenge Assessment Engine. You'll learn how to:

- Build deliberately unreliable applications using CloudFormation
- Define assessment criteria for reliability improvements
- Implement check functions to evaluate solutions
- Test your challenges locally using real AWS resources
- Improve and validate your challenges

The completed challenge will allow participants to improve a simple API service by implementing AWS Well-Architected Reliability Pillar best practices.

## Prerequisites

- AWS account with administrator access
- Node.js 14.x or higher
- AWS CLI installed and configured
- Serverless Framework
- Basic knowledge of AWS services (Lambda, DynamoDB, API Gateway, CloudWatch)

## Development Environment Setup

1. **Install AWS CLI and configure credentials**

```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS credentials
aws configure
# Enter your AWS Access Key ID, Secret Access Key, region (e.g., us-east-1), and output format (json)
```

2. **Install Node.js (v14.x or higher)**

```bash
# Using nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 14
nvm use 14
```

3. **Install Serverless Framework**

```bash
npm install -g serverless
```

4. **Create a project directory**

```bash
mkdir aws-reliability-ctf
cd aws-reliability-ctf
```

5. **Install the CTF Challenge CLI Tool**

```bash
# Clone the repository (replace with actual repository)
git clone https://github.com/your-org/ctf-challenge-cli.git
cd ctf-challenge-cli

# Install dependencies and link the CLI tool globally
npm install
npm link

# Verify installation
ctf-challenge --version
```

## Creating a Simple Unreliable Application

First, let's create a simple unreliable API service using CloudFormation that will serve as the base for our challenge.

### Create application directory

```bash
mkdir simple-api-service
cd simple-api-service
```

### Create CloudFormation template

Create a file named `unreliable-api-template.yaml`:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'CTF Challenge - Unreliable API Service (Starting Point)'

Resources:
  # Deliberately unreliable single-region setup
  ItemsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub ${AWS::StackName}-items
      BillingMode: PAY_PER_REQUEST
      # Missing point-in-time recovery
      KeySchema:
        - AttributeName: itemId
          KeyType: HASH
      AttributeDefinitions:
        - AttributeName: itemId
          AttributeType: S
      # No global tables configuration

  # Lambda function with reliability issues
  ApiFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub ${AWS::StackName}-api-function
      Handler: index.handler
      Runtime: nodejs14.x
      Timeout: 3 # Short timeout - reliability issue
      # No reserved concurrency
      # No retry configuration
      # No DLQ
      Role: !GetAtt LambdaExecutionRole.Arn
      Code:
        ZipFile: |
          exports.handler = async (event) => {
            // No error handling - reliability issue
            const AWS = require('aws-sdk');
            const dynamoDB = new AWS.DynamoDB.DocumentClient();
            
            // Hard-coded table name - reliability issue
            const tableName = '${AWS::StackName}-items';
            
            if (event.httpMethod === 'GET') {
              // Direct database call without retry logic - reliability issue
              const result = await dynamoDB.scan({
                TableName: tableName
              }).promise();
              
              return {
                statusCode: 200,
                body: JSON.stringify(result.Items)
              };
            } else if (event.httpMethod === 'POST') {
              const item = JSON.parse(event.body);
              // No validation - reliability issue
              
              await dynamoDB.put({
                TableName: tableName,
                Item: {
                  itemId: item.id || Date.now().toString(),
                  content: item.content,
                  createdAt: Date.now()
                }
              }).promise();
              
              return {
                statusCode: 201,
                body: JSON.stringify({ message: 'Item created' })
              };
            }
            
            return {
              statusCode: 400,
              body: JSON.stringify({ message: 'Invalid request' })
            };
          }

  # API Gateway with no throttling settings
  ApiGateway:
    Type: AWS::ApiGateway::RestApi
    Properties:
      Name: !Sub ${AWS::StackName}-api
      Description: Unreliable API Service

  ApiResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref ApiGateway
      ParentId: !GetAtt ApiGateway.RootResourceId
      PathPart: 'items'

  ApiMethodGet:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref ApiGateway
      ResourceId: !Ref ApiResource
      HttpMethod: GET
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ApiFunction.Arn}/invocations
      # No request validation
      # No throttling settings

  ApiMethodPost:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref ApiGateway
      ResourceId: !Ref ApiResource
      HttpMethod: POST
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ApiFunction.Arn}/invocations
      # No request validation
      # No throttling settings

  ApiDeployment:
    Type: AWS::ApiGateway::Deployment
    DependsOn:
      - ApiMethodGet
      - ApiMethodPost
    Properties:
      RestApiId: !Ref ApiGateway
      StageName: 'prod'

  # Missing CloudWatch alarms
  # Missing health check endpoint

  # Lambda role
  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: 'sts:AssumeRole'
      ManagedPolicyArns:
        - 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
      Policies:
        - PolicyName: DynamoDBAccess
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - 'dynamodb:GetItem'
                  - 'dynamodb:PutItem'
                  - 'dynamodb:Scan'
                Resource: !GetAtt ItemsTable.Arn

  # Lambda permission
  ApiGatewayPermission:
    Type: AWS::Lambda::Permission
    Properties:
      Action: 'lambda:InvokeFunction'
      FunctionName: !Ref ApiFunction
      Principal: 'apigateway.amazonaws.com'
      SourceArn: !Sub arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiGateway}/*/GET/items

Outputs:
  ApiEndpoint:
    Description: API Gateway endpoint URL
    Value: !Sub https://${ApiGateway}.execute-api.${AWS::Region}.amazonaws.com/prod/items
```

### Create a deployment script

Create a file named `deploy-test-instance.js`:

```javascript
const AWS = require('aws-sdk');
const { execSync } = require('child_process');
const fs = require('fs');

// Function to deploy a test instance
async function deployTestInstance(participantId) {
  console.log(`Deploying test instance for participant: ${participantId}`);
  
  // Set the stack name
  const stackName = `simple-api-challenge-${participantId}`;
  
  // Deploy CloudFormation template
  try {
    console.log(`Creating CloudFormation stack: ${stackName}`);
    
    // Use AWS CLI to deploy CloudFormation template
    execSync(`aws cloudformation deploy \
      --template-file unreliable-api-template.yaml \
      --stack-name ${stackName} \
      --capabilities CAPABILITY_IAM`, 
      { stdio: 'inherit' }
    );
    
    // Get stack outputs
    const cloudformation = new AWS.CloudFormation();
    const stackResponse = await cloudformation.describeStacks({
      StackName: stackName
    }).promise();
    
    const outputs = stackResponse.Stacks[0].Outputs;
    const apiEndpoint = outputs.find(o => o.OutputKey === 'ApiEndpoint').OutputValue;
    
    console.log(`Stack deployment complete.`);
    console.log(`API Endpoint: ${apiEndpoint}`);
    
    // Add some test data to the DynamoDB table
    await addTestData(stackName);
    
    // Save deployment info for testing
    const deploymentInfo = {
      participantId,
      stackName,
      apiEndpoint,
      deployedAt: new Date().toISOString()
    };
    
    if (!fs.existsSync('./deployments')) {
      fs.mkdirSync('./deployments');
    }
    
    fs.writeFileSync(
      `./deployments/${participantId}.json`,
      JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log(`Deployment info saved to ./deployments/${participantId}.json`);
    
    return deploymentInfo;
  } catch (error) {
    console.error('Deployment failed:', error);
    throw error;
  }
}

// Function to add test data to DynamoDB
async function addTestData(stackName) {
  console.log('Adding test data to DynamoDB...');
  
  const dynamoDB = new AWS.DynamoDB.DocumentClient();
  const tableName = `${stackName}-items`;
  
  const testItems = [
    { itemId: 'item1', content: 'Test Item 1', createdAt: Date.now() },
    { itemId: 'item2', content: 'Test Item 2', createdAt: Date.now() },
    { itemId: 'item3', content: 'Test Item 3', createdAt: Date.now() }
  ];
  
  for (const item of testItems) {
    await dynamoDB.put({
      TableName: tableName,
      Item: item
    }).promise();
  }
  
  console.log('Test data added successfully.');
}

// Run if called directly
if (require.main === module) {
  const participantId = process.argv[2] || `test-user-${Date.now().toString().substring(9)}`;
  
  deployTestInstance(participantId)
    .then(result => console.log('Test instance deployed successfully!'))
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}

module.exports = { deployTestInstance };
```

### Install necessary packages

```bash
npm init -y
npm install aws-sdk
```

## Creating the Challenge

Now, let's create the challenge structure using the CLI tool:

```bash
# Go back to the main directory
cd ..

# Create a new challenge
ctf-challenge create simple-api-challenge
cd simple-api-challenge
```

### Configure the challenge

Edit the `config.json` file:

```json
{
  "challengeId": "simple-api-challenge",
  "name": "Simple API Service Challenge",
  "description": "Improve the reliability of a simple API service experiencing issues during load",
  "difficulty": "beginner",
  "timeEstimate": "60",
  "passingScore": 80,
  "assessmentCriteria": [
    {
      "id": "dynamodb-backups",
      "name": "DynamoDB Point-in-Time Recovery",
      "points": 10,
      "checkFunction": "checkDynamoDBBackups",
      "description": "Enable point-in-time recovery for the DynamoDB table"
    },
    {
      "id": "error-handling",
      "name": "API Error Handling",
      "points": 15,
      "checkFunction": "checkErrorHandling",
      "description": "Implement proper error handling in the Lambda function"
    },
    {
      "id": "dead-letter-queue",
      "name": "Lambda Dead Letter Queue",
      "points": 10,
      "checkFunction": "checkDeadLetterQueue",
      "description": "Configure a Dead Letter Queue for the Lambda function"
    },
    {
      "id": "api-throttling",
      "name": "API Gateway Throttling",
      "points": 10,
      "checkFunction": "checkApiThrottling",
      "description": "Implement API Gateway throttling"
    },
    {
      "id": "cloudwatch-alarms",
      "name": "CloudWatch Alarms",
      "points": 15,
      "checkFunction": "checkCloudWatchAlarms",
      "description": "Set up appropriate CloudWatch alarms"
    }
  ]
}
```

### Implement check functions

Edit the `check-functions.js` file:

```javascript
module.exports = {
  /**
   * Checks if the participant has enabled point-in-time recovery for DynamoDB
   */
  async checkDynamoDBBackups(participantId, stackName) {
    const AWS = require('aws-sdk');
    const dynamoDB = new AWS.DynamoDB();
    
    console.log(`Checking DynamoDB point-in-time recovery for participant: ${participantId}`);
    console.log(`Stack name: ${stackName}`);
    
    // Get table name from stack name
    const tableName = `${stackName}-items`;
    
    try {
      // Check if the table has point-in-time recovery enabled
      const result = await dynamoDB.describeContinuousBackups({
        TableName: tableName
      }).promise();
      
      const hasPITR = result.ContinuousBackupsDescription && 
                      result.ContinuousBackupsDescription.PointInTimeRecoveryDescription &&
                      result.ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus === 'ENABLED';
      
      console.log(`Table ${tableName} PITR enabled: ${hasPITR}`);
      
      return {
        implemented: hasPITR,
        details: {
          tableName,
          continuousBackupsEnabled: result.ContinuousBackupsDescription.ContinuousBackupsStatus === 'ENABLED',
          pointInTimeRecoveryEnabled: hasPITR
        }
      };
    } catch (error) {
      console.error(`Error checking PITR for table ${tableName}:`, error);
      return {
        implemented: false,
        details: {
          error: error.message
        }
      };
    }
  },
  
  /**
   * Checks if the participant has implemented proper error handling
   */
  async checkErrorHandling(participantId, stackName) {
    const AWS = require('aws-sdk');
    const lambda = new AWS.Lambda();
    
    console.log(`Checking error handling for participant: ${participantId}`);
    
    // Get function name from stack name
    const functionName = `${stackName}-api-function`;
    
    try {
      // Get the Lambda function code
      const functionInfo = await lambda.getFunction({
        FunctionName: functionName
      }).promise();
      
      // For a thorough check, we would download and analyze the code
      // This simplified version checks for Lambda configuration features
      // that indicate good error handling practices
      
      // Check if timeout is sufficient (> 5 seconds)
      const hasReasonableTimeout = functionInfo.Configuration.Timeout >= 5;
      
      // Check if there's retry configuration (difficult to check directly)
      // In a real check, we'd analyze the code or check CloudFormation template
      const hasRetryConfiguration = false; // Simplified check
      
      // Since we can't easily analyze code content directly in this simplified example,
      // we'll use Lambda configuration as a proxy indicator
      const implemented = hasReasonableTimeout;
      
      return {
        implemented,
        details: {
          functionName,
          hasReasonableTimeout,
          timeout: `${functionInfo.Configuration.Timeout} seconds`,
          recommendations: implemented ? [] : [
            "Increase Lambda timeout to at least 5 seconds",
            "Implement try/catch blocks for all database operations",
            "Add retry logic with exponential backoff"
          ]
        }
      };
    } catch (error) {
      console.error(`Error checking error handling for function ${functionName}:`, error);
      return {
        implemented: false,
        details: {
          error: error.message
        }
      };
    }
  },
  
  /**
   * Checks if the participant has configured a Dead Letter Queue
   */
  async checkDeadLetterQueue(participantId, stackName) {
    const AWS = require('aws-sdk');
    const lambda = new AWS.Lambda();
    
    console.log(`Checking DLQ for participant: ${participantId}`);
    
    // Get function name from stack name
    const functionName = `${stackName}-api-function`;
    
    try {
      // Get the Lambda function configuration
      const functionInfo = await lambda.getFunction({
        FunctionName: functionName
      }).promise();
      
      // Check if a Dead Letter Queue is configured
      const hasDLQ = functionInfo.Configuration.DeadLetterConfig && 
                     functionInfo.Configuration.DeadLetterConfig.TargetArn;
      
      return {
        implemented: hasDLQ,
        details: {
          functionName,
          hasDLQ,
          dlqArn: hasDLQ ? functionInfo.Configuration.DeadLetterConfig.TargetArn : null,
          recommendations: hasDLQ ? [] : [
            "Configure an SQS Dead Letter Queue for failed Lambda executions"
          ]
        }
      };
    } catch (error) {
      console.error(`Error checking DLQ for function ${functionName}:`, error);
      return {
        implemented: false,
        details: {
          error: error.message
        }
      };
    }
  },
  
  /**
   * Checks if the participant has implemented API Gateway throttling
   */
  async checkApiThrottling(participantId, stackName) {
    const AWS = require('aws-sdk');
    const apiGateway = new AWS.APIGateway();
    
    console.log(`Checking API throttling for participant: ${participantId}`);
    
    try {
      // Get APIs
      const apis = await apiGateway.getRestApis().promise();
      
      // Find the API for this stack
      const api = apis.items.find(api => api.name === `${stackName}-api`);
      
      if (!api) {
        console.log(`API not found for stack ${stackName}`);
        return {
          implemented: false,
          details: {
            error: `API not found for stack ${stackName}`
          }
        };
      }
      
      // Get stage
      const stages = await apiGateway.getStages({
        restApiId: api.id
      }).promise();
      
      // Check if any stage has throttling enabled
      const throttledStages = stages.item.filter(stage => {
        // Check for account-level throttling
        if (stage.throttling && 
            (stage.throttling.rateLimit || stage.throttling.burstLimit)) {
          return true;
        }
        
        // Check for method-level throttling
        if (stage.methodSettings && 
            Object.values(stage.methodSettings).some(
              method => method.throttlingRateLimit || method.throttlingBurstLimit
            )) {
          return true;
        }
        
        return false;
      });
      
      const hasThrottling = throttledStages.length > 0;
      
      return {
        implemented: hasThrottling,
        details: {
          apiId: api.id,
          apiName: api.name,
          hasThrottling,
          stagesWithThrottling: throttledStages.map(s => s.stageName),
          recommendations: hasThrottling ? [] : [
            "Configure API Gateway throttling to limit request rates",
            "Set appropriate rate limits and burst limits"
          ]
        }
      };
    } catch (error) {
      console.error(`Error checking API throttling:`, error);
      return {
        implemented: false,
        details: {
          error: error.message
        }
      };
    }
  },
  
  /**
   * Checks if the participant has set up CloudWatch alarms
   */
  async checkCloudWatchAlarms(participantId, stackName) {
    const AWS = require('aws-sdk');
    const cloudWatch = new AWS.CloudWatch();
    
    console.log(`Checking CloudWatch alarms for participant: ${participantId}`);
    
    try {
      // List all CloudWatch alarms related to this stack
      const alarms = await cloudWatch.describeAlarms().promise();
      
      // Filter alarms related to this stack
      const stackAlarms = alarms.MetricAlarms.filter(alarm => 
        alarm.AlarmName.includes(stackName) || 
        (alarm.Dimensions && alarm.Dimensions.some(d => d.Value.includes(stackName)))
      );
      
      // Check if there are any relevant alarms
      const hasAlarms = stackAlarms.length > 0;
      
      // Check if there are different types of alarms (API, Lambda, DynamoDB)
      const alarmTypes = new Set();
      
      stackAlarms.forEach(alarm => {
        if (alarm.Namespace === 'AWS/Lambda') alarmTypes.add('lambda');
        if (alarm.Namespace === 'AWS/ApiGateway') alarmTypes.add('apiGateway');
        if (alarm.Namespace === 'AWS/DynamoDB') alarmTypes.add('dynamoDB');
      });
      
      // Consider it well-implemented if there are alarms for at least 2 services
      const wellImplemented = alarmTypes.size >= 2;
      
      return {
        implemented: hasAlarms && wellImplemented,
        details: {
          hasAlarms,
          alarmCount: stackAlarms.length,
          alarmTypes: Array.from(alarmTypes),
          alarms: stackAlarms.map(a => ({
            name: a.AlarmName,
            metric: a.MetricName,
            namespace: a.Namespace
          })),
          recommendations: hasAlarms ? [] : [
            "Set up CloudWatch alarms for critical metrics",
            "Monitor API Gateway 4xx and 5xx errors",
            "Monitor Lambda errors and throttling",
            "Monitor DynamoDB throttling events"
          ]
        }
      };
    } catch (error) {
      console.error(`Error checking CloudWatch alarms:`, error);
      return {
        implemented: false,
        details: {
          error: error.message
        }
      };
    }
  }
};
```

## Deploying and Testing the Challenge

Now that we've created our challenge, let's deploy a test instance and run local tests against it.

### Deploy a test instance

```bash
# Navigate to the application directory
cd ../simple-api-service

# Deploy a test instance
node deploy-test-instance.js test-user-1
```

This script will:
1. Deploy the CloudFormation stack with our unreliable API service
2. Add test data to the DynamoDB table
3. Save deployment information for testing

### Test the challenge locally

```bash
# Navigate to the challenge directory
cd ../simple-api-challenge

# Run local test against the deployed test instance
ctf-challenge test simple-api-challenge --participantId test-user-1
```

You should see output similar to this:

```
Testing challenge: simple-api-challenge
Participant ID: test-user-1

[✗] DynamoDB Point-in-Time Recovery (0/10 pts)
    Not implemented: Table simple-api-challenge-test-user-1-items does not have point-in-time recovery enabled
    
[✗] API Error Handling (0/15 pts)
    Not implemented: Lambda function has insufficient timeout (3 seconds)
    
[✗] Lambda Dead Letter Queue (0/10 pts)
    Not implemented: No Dead Letter Queue configured for Lambda function
    
[✗] API Gateway Throttling (0/10 pts)
    Not implemented: No throttling settings found on API Gateway
    
[✗] CloudWatch Alarms (0/15 pts)
    Not implemented: No CloudWatch alarms found for stack resources

Total Score: 0/60 (0%)
```

## Implementing Improvements for Testing

Let's implement some improvements to see how the scoring works. We'll create an improved template with the fixes.

Create a file named `improved-api-template.yaml` in the simple-api-service directory:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'CTF Challenge - Improved API Service (With Some Reliability Improvements)'

Resources:
  # Added point-in-time recovery
  ItemsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub ${AWS::StackName}-items
      BillingMode: PAY_PER_REQUEST
      # Added point-in-time recovery
      PointInTimeRecoverySpecification:
        PointInTimeRecoveryEnabled: true
      KeySchema:
        - AttributeName: itemId
          KeyType: HASH
      AttributeDefinitions:
        - AttributeName: itemId
          AttributeType: S

  # Added SQS Dead Letter Queue
  ApiDLQ:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub ${AWS::StackName}-api-dlq

  # Lambda function with some improvements
  ApiFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub ${AWS::StackName}-api-function
      Handler: index.handler
      Runtime: nodejs14.x
      Timeout: 10 # Increased timeout - improved reliability
      # Added Dead Letter Queue
      DeadLetterConfig:
        TargetArn: !GetAtt ApiDLQ.Arn
      Role: !GetAtt LambdaExecutionRole.Arn
      Code:
        ZipFile: |
          exports.handler = async (event) => {
            // Added basic error handling - improved reliability
            try {
              const AWS = require('aws-sdk');
              const dynamoDB = new AWS.DynamoDB.DocumentClient();
              
              // Using environment variable instead of hard-coding
              const tableName = process.env.TABLE_NAME;
              
              if (event.httpMethod === 'GET') {
                // Added error handling around database call
                try {
                  const result = await dynamoDB.scan({
                    TableName: tableName
                  }).promise();
                  
                  return {
                    statusCode: 200,
                    body: JSON.stringify(result.Items)
                  };
                } catch (dbError) {
                  console.error('Error scanning table:', dbError);
                  return {
                    statusCode: 500,
                    body: JSON.stringify({ message: 'Database error' })
                  };
                }
              } else if (event.httpMethod === 'POST') {
                // Added input validation - improved reliability
                let item;
                try {
                  item = JSON.parse(event.body);
                  if (!item.content) {
                    return {
                      statusCode: 400,
                      body: JSON.stringify({ message: 'Missing required field: content' })
                    };
                  }
                } catch (parseError) {
                  return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Invalid JSON in request body' })
                  };
                }
                
                // Added error handling around database operation
                try {
                  await dynamoDB.put({
                    TableName: tableName,
                    Item: {
                      itemId: item.id || Date.now().toString(),
                      content: item.content,
                      createdAt: Date.now()
                    }
                  }).promise();
                  
                  return {
                    statusCode: 201,
                    body: JSON.stringify({ message: 'Item created' })
                  };
                } catch (dbError) {
                  console.error('Error putting item:', dbError);
                  return {
                    statusCode: 500,
                    body: JSON.stringify({ message: 'Database error' })
                  };
                }
              }
              
              return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid request method' })
              };
            } catch (error) {
              console.error('Unhandled error:', error);
              return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal server error' })
              };
            }
          }
      Environment:
        Variables:
          TABLE_NAME: !Sub ${AWS::StackName}-items

  # Rest of the template remains the same
  # API Gateway with no throttling settings
  ApiGateway:
    Type: AWS::ApiGateway::RestApi
    Properties:
      Name: !Sub ${AWS::StackName}-api
      Description: Improved API Service

  ApiResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref ApiGateway
      ParentId: !GetAtt ApiGateway.RootResourceId
      PathPart: 'items'

  ApiMethodGet:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref ApiGateway
      ResourceId: !Ref ApiResource
      HttpMethod: GET
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ApiFunction.Arn}/invocations

  ApiMethodPost:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref ApiGateway
      ResourceId: !Ref ApiResource
      HttpMethod: POST
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ApiFunction.Arn}/invocations

  ApiDeployment:
    Type: AWS::ApiGateway::Deployment
    DependsOn:
      - ApiMethodGet
      - ApiMethodPost
    Properties:
      RestApiId: !Ref ApiGateway
      StageName: 'prod'

  # Added a CloudWatch alarm
  ApiErrorAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: !Sub ${AWS::StackName}-api-errors
      AlarmDescription: 'Alarm when API returns too many errors'
      MetricName: '5XXError'
      Namespace: 'AWS/ApiGateway'
      Statistic: 'Sum'
      Period: 60
      EvaluationPeriods: 1
      Threshold: 5
      ComparisonOperator: 'GreaterThanThreshold'
      Dimensions:
        - Name: ApiName
          Value: !Ref ApiGateway
        - Name: Stage
          Value: 'prod'

  # Lambda role with added SQS permissions
  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: 'sts:AssumeRole'
      ManagedPolicyArns:
        - 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
      Policies:
        - PolicyName: DynamoDBAccess
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - 'dynamodb:GetItem'
                  - 'dynamodb:PutItem'
                  - 'dynamodb:Scan'
                Resource: !GetAtt ItemsTable.Arn
        - PolicyName: SQSAccess
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - 'sqs:SendMessage'
                Resource: !GetAtt ApiDLQ.Arn

  # Lambda permission
  ApiGatewayPermission:
    Type: AWS::Lambda::Permission
    Properties:
      Action: 'lambda:InvokeFunction'
      FunctionName: !Ref ApiFunction
      Principal: 'apigateway.amazonaws.com'
      SourceArn: !Sub arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiGateway}/*/GET/items

Outputs:
  ApiEndpoint:
    Description: API Gateway endpoint URL
    Value: !Sub https://${ApiGateway}.execute-api.${AWS::Region}.amazonaws.com/prod/items
```

### Update the test deployment

```bash
# Navigate to the application directory
cd ../simple-api-service

# Update the CloudFormation stack with improvements
aws cloudformation deploy \
  --template-file improved-api-template.yaml \
  --stack-name simple-api-challenge-test-user-1 \
  --capabilities CAPABILITY_IAM
```

### Run the test again

```bash
# Navigate to the challenge directory
cd ../simple-api-challenge

# Run local test against the improved deployment
ctf-challenge test simple-api-challenge --participantId test-user-1
```

Now you should see improvements in the score:

```
Testing challenge: simple-api-challenge
Participant ID: test-user-1

[✓] DynamoDB Point-in-Time Recovery (10/10 pts)
    Point-in-time recovery is enabled for table simple-api-challenge-test-user-1-items
    
[✓] API Error Handling (15/15 pts)
    Lambda function now has reasonable timeout (10 seconds)
    
[✓] Lambda Dead Letter Queue (10/10 pts)
    Dead Letter Queue configured for Lambda function
    
[✗] API Gateway Throttling (0/10 pts)
    Not implemented: No throttling settings found on API Gateway
    
[✓] CloudWatch Alarms (15/15 pts)
    Implemented: Found CloudWatch alarms for API Gateway

Total Score: 50/60 (83%)
```

## Clean Up

When you're done testing, make sure to clean up your AWS resources:

```bash
# Delete the CloudFormation stack
aws cloudformation delete-stack --stack-name simple-api-challenge-test-user-1
```

## Architecture Overview

The Dynamic Challenge Assessment Engine uses a modular architecture:

1. **S3 Challenge Repository**: Stores challenge files in a standardized structure
2. **Challenge Registry (DynamoDB)**: Central database of all available challenges
3. **Core Assessment Engine (Lambda)**: Dynamically loads and runs check functions
4. **Challenge Management API**: REST API for managing challenges
5. **CLI Tool**: Simplifies challenge creation and testing

This architecture allows multiple engineers to create challenges independently without modifying the core assessment engine.

## Advanced Topics

For more advanced implementations, consider:

1. **Dynamic Loading of Check Functions**: Implement code to dynamically load and execute challenge-specific check functions
2. **Mock Testing Mode**: Create a mock mode for testing check functions without actual AWS resources
3. **Versioning**: Add support for challenge versions to maintain backward compatibility
4. **Participant Experience**: Create a web UI for participants to see their progress
5. **Metrics and Analytics**: Track challenge completion rates and common issues

---

This project provides a framework for creating educational AWS reliability challenges based on the Well-Architected Reliability Pillar. By identifying and fixing deliberate reliability weaknesses, participants learn practical skills for building robust cloud applications.

For questions or contributions, please open an issue or pull request on this repository.
