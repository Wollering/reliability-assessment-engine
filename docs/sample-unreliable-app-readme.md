# Creating a Sample Unreliable Application Challenge

This guide provides step-by-step instructions for creating a sample unreliable application that can be used as a CTF challenge. Participants will identify and fix reliability issues based on AWS Well-Architected Framework principles.

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Setting Up the Unreliable Application](#setting-up-the-unreliable-application)
4. [Creating the Assessment Engine](#creating-the-assessment-engine)
5. [Testing the Challenge](#testing-the-challenge)
6. [Participant Experience](#participant-experience)

## Overview

This challenge will create a deliberately unreliable web application using AWS serverless technologies. Participants must improve its reliability by implementing AWS Well-Architected Reliability Pillar best practices.

### Challenge Scenario

```
Scenario: "Unreliable API Service"

You've been hired to improve an API service that's experiencing reliability issues. 
The service processes data but regularly fails during peak usage. Your task is to 
identify and fix the reliability weaknesses to achieve a reliability score of at 
least 80/100.
```

## Prerequisites

- AWS account with administrator access
- Node.js 14.x or higher
- AWS CLI configured with appropriate credentials
- Serverless Framework installed (`npm install -g serverless`)
- Basic knowledge of AWS services (Lambda, DynamoDB, CloudWatch)

## Setting Up the Unreliable Application

### Step 1: Create Project Structure

```bash
# Create project directory
mkdir unreliable-api-challenge
cd unreliable-api-challenge

# Initialize npm project
npm init -y

# Install dependencies
npm install aws-sdk serverless-http express mongoose jsonwebtoken

# Install dev dependencies
npm install --save-dev serverless
```

### Step 2: Create Basic Application Files

Create `handler.js` with deliberately unreliable code:

```javascript
'use strict';
const express = require('express');
const serverless = require('serverless-http');
const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const app = express();
app.use(express.json());

// API Routes with reliability issues
app.get('/api/products', async (req, res) => {
  // RELIABILITY ISSUE: No error handling
  // RELIABILITY ISSUE: No request validation
  
  // RELIABILITY ISSUE: Hard-coded table name (not environment variable)
  const tableName = 'unreliable-app-products';
  
  // RELIABILITY ISSUE: Direct database call without retry logic
  const result = await dynamoDB.scan({
    TableName: tableName
  }).promise();
  
  // RELIABILITY ISSUE: No proper error response handling
  const items = result.Items;
  
  // RELIABILITY ISSUE: Synchronous processing that could be async
  const processedItems = processItems(items);
  
  return {
    statusCode: 200,
    body: JSON.stringify({ items: processedItems }),
  };
});

// RELIABILITY ISSUE: CPU-intensive function with no timeout handling
function processItems(items) {
  let processedItems = [];
  for (const item of items) {
    // No error handling within loop
    processedItems.push({
      id: item.id,
      processed: true,
      timestamp: Date.now()
    });
  }
  return processedItems;
}

// RELIABILITY ISSUE: Missing health check endpoint

module.exports.api = serverless(app);
```

### Step 3: Create Serverless Configuration

Create `serverless.yml` with unreliable configuration:

```yaml
service: unreliable-api-challenge

provider:
  name: aws
  runtime: nodejs14.x
  region: us-east-1
  # RELIABILITY ISSUE: Missing environment variables
  # RELIABILITY ISSUE: No error handling configurations
  # RELIABILITY ISSUE: No proper IAM permissions
  iamRoleStatements:
    - Effect: Allow
      Action:
        - dynamodb:Scan
      Resource: "arn:aws:dynamodb:${self:provider.region}:*:table/unreliable-app-products"

functions:
  api:
    handler: handler.api
    events:
      - http:
          path: /api/{proxy+}
          method: ANY
    # RELIABILITY ISSUE: No timeout configuration
    # RELIABILITY ISSUE: No retry configuration
    # RELIABILITY ISSUE: No dead letter queue

resources:
  Resources:
    ProductsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: unreliable-app-products
        BillingMode: PAY_PER_REQUEST
        # RELIABILITY ISSUE: Missing point-in-time recovery
        # RELIABILITY ISSUE: No backup configuration
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
    # RELIABILITY ISSUE: Missing CloudWatch Alarms
    # RELIABILITY ISSUE: No SQS queue for async processing
```

### Step 4: Create Deployment Script for Participant Instances

Create `deploy-challenge.js`:

```javascript
// deploy-challenge.js
const AWS = require('aws-sdk');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Function to deploy the unreliable app for a participant
async function deployChallenge(participantId) {
  console.log(`Deploying challenge for participant: ${participantId}`);
  
  // Create participant-specific directory
  const participantDir = `./deployment-${participantId}`;
  if (!fs.existsSync(participantDir)) {
    fs.mkdirSync(participantDir);
  }
  
  // Copy files to participant directory
  fs.copyFileSync('serverless.yml', path.join(participantDir, 'serverless.yml'));
  fs.copyFileSync('handler.js', path.join(participantDir, 'handler.js'));
  
  // Update serverless.yml with participant-specific values
  let serverlessYml = fs.readFileSync(path.join(participantDir, 'serverless.yml'), 'utf8');
  serverlessYml = serverlessYml.replace(
    'service: unreliable-api-challenge',
    `service: unreliable-api-challenge-${participantId}`
  );
  serverlessYml = serverlessYml.replace(
    'unreliable-app-products',
    `unreliable-app-products-${participantId}`
  );
  fs.writeFileSync(path.join(participantDir, 'serverless.yml'), serverlessYml);
  
  // Update handler.js with participant-specific table name
  let handlerJs = fs.readFileSync(path.join(participantDir, 'handler.js'), 'utf8');
  handlerJs = handlerJs.replace(
    "const tableName = 'unreliable-app-products'",
    `const tableName = 'unreliable-app-products-${participantId}'`
  );
  fs.writeFileSync(path.join(participantDir, 'handler.js'), handlerJs);
  
  // Deploy the stack
  try {
    console.log('Deploying serverless stack...');
    execSync(`cd ${participantDir} && serverless deploy`, { stdio: 'inherit' });
    
    // Add sample data to the DynamoDB table
    await addSampleData(participantId);
    
    console.log('Deployment complete!');
    
    // Get the API URL
    const apiUrl = execSync(`cd ${participantDir} && serverless info --verbose`)
      .toString()
      .match(/HttpApiUrl: (.*)/)[1];
    
    return {
      participantId,
      apiUrl,
      status: 'deployed'
    };
  } catch (error) {
    console.error('Deployment failed:', error);
    throw error;
  }
}

// Function to add sample data to the DynamoDB table
async function addSampleData(participantId) {
  const tableName = `unreliable-app-products-${participantId}`;
  const dynamoDB = new AWS.DynamoDB.DocumentClient();
  
  const sampleProducts = [
    { id: 'prod1', name: 'Product 1', price: 19.99, inStock: true },
    { id: 'prod2', name: 'Product 2', price: 29.99, inStock: true },
    { id: 'prod3', name: 'Product 3', price: 39.99, inStock: false }
  ];
  
  for (const product of sampleProducts) {
    await dynamoDB.put({
      TableName: tableName,
      Item: product
    }).promise();
  }
  
  console.log(`Added sample data to table ${tableName}`);
}

// Run if called directly
if (require.main === module) {
  const participantId = process.argv[2] || `participant-${Date.now().toString().substring(9)}`;
  deployChallenge(participantId)
    .then(result => console.log('Deployment result:', result))
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}

module.exports = { deployChallenge };
```

## Creating the Assessment Engine

### Step 1: Create the Assessment Engine Structure

Set up the assessment engine directory:

```bash
mkdir reliability-assessment-engine
cd reliability-assessment-engine

npm init -y
npm install aws-sdk axios lodash
npm install --save-dev jest aws-sdk-mock serverless
```

### Step 2: Create the Core Assessment Functions

Create `src/reliability-assessment.js`:

```javascript
// reliability-assessment.js - Core assessment function
const AWS = require('aws-sdk');

// Initialize AWS SDK
AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const cloudformation = new AWS.CloudFormation();
const lambda = new AWS.Lambda();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

/**
 * Assesses reliability improvements for a participant
 */
exports.handler = async (event) => {
  const participantId = event.participantId || process.env.PARTICIPANT_ID;
  console.log(`Assessing reliability improvements for participant ${participantId}`);
  
  try {
    let reliabilityScore = 0;
    const improvements = [];
    const suggestions = [];
    
    // 1. Check if multi-region deployment is configured
    const multiRegionCheck = await checkMultiRegionDeployment(participantId);
    if (multiRegionCheck.implemented) {
      reliabilityScore += 10;
      improvements.push('Multi-region deployment configured');
    } else {
      suggestions.push('Implement multi-region deployment for disaster recovery');
    }
    
    // 2. Check for DynamoDB backups and point-in-time recovery
    const backupCheck = await checkDynamoDBBackups(participantId);
    if (backupCheck.implemented) {
      reliabilityScore += 10;
      improvements.push('DynamoDB point-in-time recovery enabled');
    } else {
      suggestions.push('Enable point-in-time recovery for DynamoDB tables');
    }
    
    // Add more checks here (error handling, monitoring, idempotency, etc.)
    
    // Update the reliability score in DynamoDB
    await updateReliabilityScore(participantId, reliabilityScore);
    
    return {
      participantId,
      reliabilityScore,
      improvements,
      suggestions,
      passed: reliabilityScore >= 80,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error assessing reliability:', error);
    throw error;
  }
};

/**
 * Updates the reliability score in DynamoDB
 */
async function updateReliabilityScore(participantId, score) {
  const params = {
    TableName: process.env.SYSTEM_METRICS_TABLE,
    Key: {
      metricId: 'reliability-score',
      participantId
    },
    UpdateExpression: 'set score = :score, lastUpdated = :time',
    ExpressionAttributeValues: {
      ':score': score,
      ':time': Date.now()
    },
    ReturnValues: 'UPDATED_NEW'
  };
  
  await dynamoDB.update(params).promise();
  return score;
}

/**
 * Check functions that analyze AWS resources for reliability patterns
 */
async function checkMultiRegionDeployment(participantId) {
  // Implement analysis code to check for multi-region deployment
  // This is a placeholder implementation
  return { implemented: false };
}

async function checkDynamoDBBackups(participantId) {
  // Implement analysis code to check for DynamoDB backups
  // This is a placeholder implementation
  return { implemented: false };
}

// Implement additional check functions here
```

### Step 3: Create Serverless Configuration for the Assessment Engine

Create `serverless.yml` for the assessment engine:

```yaml
service: reliability-assessment-engine

provider:
  name: aws
  runtime: nodejs14.x
  region: us-east-1
  environment:
    SYSTEM_METRICS_TABLE: reliability-metrics
  iamRoleStatements:
    - Effect: Allow
      Action:
        - dynamodb:GetItem
        - dynamodb:PutItem
        - dynamodb:UpdateItem
      Resource: "arn:aws:dynamodb:${self:provider.region}:*:table/reliability-metrics"
    - Effect: Allow
      Action:
        - cloudformation:DescribeStacks
        - cloudformation:GetTemplate
      Resource: "*"

functions:
  assessmentEngine:
    handler: src/reliability-assessment.handler
    timeout: 30
    memorySize: 256

resources:
  Resources:
    ReliabilityMetricsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: reliability-metrics
        BillingMode: PAY_PER_REQUEST
        KeySchema:
          - AttributeName: metricId
            KeyType: HASH
          - AttributeName: participantId
            KeyType: RANGE
        AttributeDefinitions:
          - AttributeName: metricId
            AttributeType: S
          - AttributeName: participantId
            AttributeType: S
```

### Step 4: Deploy the Assessment Engine

```bash
cd reliability-assessment-engine
serverless deploy
```

## Testing the Challenge

### Step 1: Deploy a Test Challenge Instance

```bash
cd unreliable-api-challenge
node deploy-challenge.js test-user-1
```

### Step 2: Evaluate the Unreliable Application

Run the assessment engine against the unreliable application:

```bash
aws lambda invoke \
  --function-name reliability-assessment-engine-dev-assessmentEngine \
  --payload '{"participantId": "test-user-1"}' \
  initial-assessment-result.json
```

### Step 3: Implement Improvements and Test

Make reliability improvements to the test instance and re-run the assessment to verify the score increases.

Example improvement - enabling point-in-time recovery:

1. Update the serverless.yml in the participant's deployment folder:
   ```yaml
   ProductsTable:
     Type: AWS::DynamoDB::Table
     Properties:
       TableName: unreliable-app-products-test-user-1
       BillingMode: PAY_PER_REQUEST
       PointInTimeRecoverySpecification:
         PointInTimeRecoveryEnabled: true
       # Rest of the configuration...
   ```

2. Redeploy and test:
   ```bash
   cd deployment-test-user-1
   serverless deploy
   
   aws lambda invoke \
     --function-name reliability-assessment-engine-dev-assessmentEngine \
     --payload '{"participantId": "test-user-1"}' \
     updated-assessment-result.json
   ```

## Participant Experience

### Step 1: Create Instructions Document

Create `instructions.md`:

```markdown
# Unreliable API Challenge

## Background
You've been hired to improve an API service that's experiencing reliability issues. The service processes data but regularly fails during peak usage.

## Your Mission
Identify and fix the reliability weaknesses in the provided application to achieve a reliability score of at least 80/100.

## Getting Started

1. Access your deployed application at: {PARTICIPANT_API_URL}
2. Examine the current architecture and identify reliability issues
3. Implement improvements using CloudFormation/Serverless Framework
4. Use the assessment engine to check your progress

## Reliability Focus Areas
- Multi-region resilience
- Data backup and recovery
- Error handling and retry mechanisms
- Monitoring and alerting
- Asynchronous processing
- Health checks and circuit breakers

## Assessment
Your solution will be automatically assessed on:
- Infrastructure resilience (35%)
- Error handling (25%)
- Monitoring and observability (20%)
- Performance efficiency (20%)

## Resources
- [AWS Well-Architected Reliability Pillar](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/welcome.html)
- [Serverless Framework Documentation](https://www.serverless.com/framework/docs/)
- [AWS DynamoDB Documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html)
```

### Step 2: Create an Improvement Guide

Create `improvement-guide.md` for participants who need help:

```markdown
# Reliability Improvement Guide

This guide provides hints for improving the reliability of your application:

## Infrastructure Resilience
- Enable point-in-time recovery for DynamoDB tables
- Configure multi-region deployment
- Use DynamoDB Global Tables for cross-region replication

## Error Handling
- Implement try/catch blocks around all database operations
- Add retry logic with exponential backoff
- Use a Dead Letter Queue (DLQ) for failed operations

## Monitoring and Alerting
- Create CloudWatch alarms for critical metrics
- Implement a proper health check endpoint
- Add custom metrics for application-specific monitoring

## Performance Efficiency
- Move processing to asynchronous flows using SQS
- Implement proper timeout handling
- Use DynamoDB DAX for caching

Remember: Implement these improvements gradually and test after each change.
```

### Step 3: Create a Deployment Script for Participants

Create `prepare-participant.js`:

```javascript
// prepare-participant.js
const { deployChallenge } = require('./deploy-challenge');
const fs = require('fs');
const path = require('path');

async function prepareParticipant(participantName, email) {
  // Create a unique ID for the participant
  const participantId = `${participantName.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString().substring(9)}`;
  
  // Deploy the challenge for this participant
  const deploymentResult = await deployChallenge(participantId);
  
  // Create participant-specific instructions
  let instructions = fs.readFileSync('instructions.md', 'utf8');
  instructions = instructions.replace(
    '{PARTICIPANT_API_URL}',
    deploymentResult.apiUrl
  );
  
  // Create participant directory
  const participantDir = `./participants/${participantId}`;
  if (!fs.existsSync(participantDir)) {
    fs.mkdirSync(participantDir, { recursive: true });
  }
  
  // Write participant-specific files
  fs.writeFileSync(path.join(participantDir, 'instructions.md'), instructions);
  fs.copyFileSync('improvement-guide.md', path.join(participantDir, 'improvement-guide.md'));
  
  // Create participant info file
  const participantInfo = {
    participantId,
    name: participantName,
    email,
    apiUrl: deploymentResult.apiUrl,
    deployedAt: new Date().toISOString(),
    challengeStatus: 'active'
  };
  fs.writeFileSync(
    path.join(participantDir, 'participant-info.json'), 
    JSON.stringify(participantInfo, null, 2)
  );
  
  console.log(`Participant ${participantName} (${participantId}) prepared successfully!`);
  console.log(`API URL: ${deploymentResult.apiUrl}`);
  console.log(`Participant files created in: ${participantDir}`);
  
  return participantInfo;
}

// Run if called directly
if (require.main === module) {
  const participantName = process.argv[2];
  const email = process.argv[3];
  
  if (!participantName || !email) {
    console.error('Usage: node prepare-participant.js "Participant Name" "email@example.com"');
    process.exit(1);
  }
  
  prepareParticipant(participantName, email)
    .then(info => console.log('Preparation complete!'))
    .catch(err => {
      console.error('Error preparing participant:', err);
      process.exit(1);
    });
}

module.exports = { prepareParticipant };
```

---

By following this guide, you'll have created a sample unreliable application challenge that's ready for participants to improve. The assessment engine will automatically evaluate their solutions against AWS Well-Architected Reliability Pillar best practices.

For additional assistance, refer to the AWS documentation or contact the CTF platform support team.
