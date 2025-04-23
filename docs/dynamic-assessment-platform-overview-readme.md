# Dynamic Challenge Assessment Engine

A modular, extensible system for AWS Well-Architected Reliability Pillar CTF challenges that allows engineers to create new challenges without modifying the core assessment engine.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Setting Up the Infrastructure](#setting-up-the-infrastructure)
4. [Creating a New Challenge](#creating-a-new-challenge)
5. [Challenge Development Workflow](#challenge-development-workflow)
6. [API Reference](#api-reference)
7. [Security Considerations](#security-considerations)

## Overview

The Dynamic Challenge Assessment Engine allows multiple engineers to develop AWS reliability-focused CTF challenges independently. Challenge-specific check functions are stored in S3 and dynamically loaded by the assessment engine at runtime, eliminating the need to modify and redeploy the core engine when creating new challenges.

### Key Benefits

- **Decoupled Development**: Engineers can create new challenges without touching the core assessment code
- **Isolated Execution**: Errors in one challenge's check functions won't affect others
- **Versioned Challenges**: Multiple versions of a challenge can exist simultaneously
- **Simplified Onboarding**: Challenge creators don't need to understand assessment engine internals
- **Scalable Architecture**: New challenges can be added without redeploying the core infrastructure

## Architecture

![Architecture Diagram](https://via.placeholder.com/800x400?text=Dynamic+Assessment+Engine+Architecture)

The system consists of the following components:

### 1. S3 Challenge Repository

Challenges are stored in a dedicated S3 bucket with a standardized structure:

```
s3://ctf-reliability-challenges/
├── voting-system/
│   ├── config.json               # Challenge configuration
│   ├── check-functions.js        # Assessment logic
│   └── resources/                # Challenge-specific resources
├── api-service/
│   ├── config.json
│   ├── check-functions.js
│   └── resources/
```

### 2. Challenge Registry (DynamoDB)

A DynamoDB table stores metadata about available challenges:

```json
{
  "challengeId": "reliability-voting-system",
  "name": "Reliable Voting System",
  "description": "Improve a voting system's reliability during peak traffic",
  "s3Location": "s3://ctf-reliability-challenges/voting-system/",
  "configFile": "config.json",
  "checkFunctionsFile": "check-functions.js",
  "difficulty": "intermediate",
  "active": true,
  "createdBy": "engineer@example.com",
  "createdAt": "2023-05-15T14:30:00Z"
}
```

### 3. Core Assessment Engine (Lambda)

The centralized Lambda function that:
- Loads challenge configurations from DynamoDB
- Dynamically loads check functions from S3
- Executes assessments
- Calculates scores
- Provides feedback

### 4. Challenge Management API

REST API for:
- Registering new challenges
- Updating existing challenges
- Activating/deactivating challenges
- Listing available challenges

### 5. CLI Tool for Challenge Developers

A command-line interface that simplifies:
- Creating challenge templates
- Testing check functions locally
- Uploading challenges to S3
- Registering challenges with the API

## Setting Up the Infrastructure

### Prerequisites

- AWS account with administrator access
- Node.js 14.x or higher
- AWS CLI configured
- Serverless Framework installed

### Deployment Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/dynamic-challenge-engine.git
   cd dynamic-challenge-engine
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Deploy the core infrastructure**:
   ```bash
   npm run deploy:core
   ```

   This deploys:
   - S3 bucket for challenges
   - DynamoDB tables for challenge registry and results
   - Lambda functions for the assessment engine
   - API Gateway endpoints
   - Required IAM roles and policies

4. **Configure the CLI tool**:
   ```bash
   npm link
   ```

## Creating a New Challenge

### Step 1: Initialize a Challenge Template

```bash
ctf-challenge create voting-system
```

This creates a directory structure:
```
voting-system/
├── config.json
├── check-functions.js
└── resources/
```

### Step 2: Configure the Challenge

Edit `config.json` to define assessment criteria:

```json
{
  "challengeId": "voting-system",
  "name": "Reliable Voting System",
  "description": "Improve a voting system experiencing reliability issues during peak traffic",
  "assessmentCriteria": [
    {
      "id": "multi-region",
      "name": "Multi-Region Deployment",
      "points": 10,
      "checkFunction": "checkMultiRegionDeployment"
    },
    {
      "id": "dynamodb-backups",
      "name": "DynamoDB Point-in-Time Recovery",
      "points": 10,
      "checkFunction": "checkDynamoDBBackups"
    },
    {
      "id": "error-handling",
      "name": "Error Handling & Retry Logic",
      "points": 15,
      "checkFunction": "checkErrorHandling"
    }
  ]
}
```

### Step 3: Implement Check Functions

Edit `check-functions.js` to implement the assessment logic:

```javascript
module.exports = {
  /**
   * Checks if the participant has implemented multi-region deployment
   */
  async checkMultiRegionDeployment(participantId, stackName) {
    const AWS = require('aws-sdk');
    
    // Check for resources in multiple regions
    const regions = ['us-east-1', 'us-west-2', 'eu-west-1'];
    const deployedInRegions = [];
    
    for (const region of regions) {
      const cf = new AWS.CloudFormation({ region });
      try {
        const stack = await cf.describeStacks({ StackName: stackName }).promise();
        if (stack.Stacks && stack.Stacks.length > 0) {
          deployedInRegions.push(region);
        }
      } catch (error) {
        // Stack doesn't exist in this region, continue
      }
    }
    
    // Check for global tables
    const dynamoDB = new AWS.DynamoDB();
    const tables = await dynamoDB.listTables().promise();
    
    let hasGlobalTables = false;
    for (const tableName of tables.TableNames) {
      if (tableName.includes(participantId)) {
        try {
          const table = await dynamoDB.describeTable({ TableName: tableName }).promise();
          if (table.Table.GlobalTableVersion) {
            hasGlobalTables = true;
            break;
          }
        } catch (error) {
          console.error(`Error checking table ${tableName}:`, error);
        }
      }
    }
    
    return {
      implemented: deployedInRegions.length > 1 || hasGlobalTables,
      details: {
        regions: deployedInRegions,
        hasGlobalTables
      }
    };
  },
  
  /**
   * Checks if the participant has enabled point-in-time recovery for DynamoDB
   */
  async checkDynamoDBBackups(participantId, stackName) {
    const AWS = require('aws-sdk');
    const dynamoDB = new AWS.DynamoDB();
    
    // Get tables associated with this participant
    const tables = await dynamoDB.listTables().promise();
    const participantTables = tables.TableNames.filter(name => 
      name.includes(participantId) || name.includes(stackName)
    );
    
    // Check point-in-time recovery for each table
    let tablesWithPITR = 0;
    const tableDetails = [];
    
    for (const tableName of participantTables) {
      try {
        const result = await dynamoDB.describeContinuousBackups({
          TableName: tableName
        }).promise();
        
        const hasPITR = result.ContinuousBackupsDescription && 
                        result.ContinuousBackupsDescription.PointInTimeRecoveryDescription &&
                        result.ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus === 'ENABLED';
        
        if (hasPITR) {
          tablesWithPITR++;
        }
        
        tableDetails.push({
          tableName,
          hasPITR
        });
      } catch (error) {
        console.error(`Error checking PITR for table ${tableName}:`, error);
        tableDetails.push({
          tableName,
          hasPITR: false,
          error: error.message
        });
      }
    }
    
    return {
      implemented: tablesWithPITR > 0 && tablesWithPITR === participantTables.length,
      details: {
        tablesChecked: participantTables.length,
        tablesWithPITR,
        tableDetails
      }
    };
  },
  
  /**
   * Checks if the participant has implemented proper error handling
   */
  async checkErrorHandling(participantId, stackName) {
    // Implementation for error handling check
    // This would analyze Lambda code, look for retry configurations, etc.
    return { implemented: false };
  }
};
```

### Step 4: Test Locally

You can test your check functions locally before uploading:

```bash
ctf-challenge test voting-system --participantId test-user-1
```

### Step 5: Upload the Challenge

Once you're satisfied with your check functions, upload the challenge:

```bash
ctf-challenge upload voting-system
```

This:
1. Uploads all files to S3
2. Registers the challenge in the registry via the API
3. Makes the challenge available for participants

## Challenge Development Workflow

1. **Create a challenge template**:
   ```bash
   ctf-challenge create my-challenge
   ```

2. **Implement check functions and configuration**:
   - Define assessment criteria in `config.json`
   - Implement check logic in `check-functions.js`
   - Add any needed resources to `resources/`

3. **Test locally against a test deployment**:
   ```bash
   # Deploy a test instance
   node deploy-test-instance.js test-user
   
   # Test your check functions
   ctf-challenge test my-challenge --participantId test-user
   ```

4. **Upload when ready**:
   ```bash
   ctf-challenge upload my-challenge
   ```

5. **Update if needed**:
   ```bash
   # Make changes, then update
   ctf-challenge update my-challenge
   ```

## API Reference

### Core Assessment Engine

The core assessment engine Lambda uses the following logic to dynamically load and run check functions:

```javascript
// reliability-assessment.js - Core engine
exports.handler = async (event) => {
  const participantId = event.participantId;
  const challengeId = event.challengeId || 'default-challenge';
  
  try {
    // 1. Load challenge configuration from registry
    const challengeConfig = await loadChallengeConfig(challengeId);
    
    // 2. Dynamically load check functions from S3
    const checkFunctions = await loadCheckFunctionsFromS3(
      challengeConfig.s3Location,
      challengeConfig.checkFunctionsFile
    );
    
    // 3. Run the assessment with the dynamically loaded functions
    const assessmentResults = await runAssessment(
      participantId, 
      challengeConfig,
      checkFunctions
    );
    
    // 4. Calculate total score
    const totalScore = calculateTotalScore(assessmentResults);
    
    // 5. Generate feedback
    const feedback = generateFeedback(assessmentResults);
    
    // 6. Update participant score in database
    await updateParticipantScore(
      challengeId,
      participantId,
      totalScore,
      assessmentResults
    );
    
    return {
      participantId,
      challengeId,
      score: totalScore,
      passed: totalScore >= challengeConfig.passingScore || 80,
      feedback,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error in assessment:', error);
    throw error;
  }
};
```

### Check Function Interface

All check functions must implement this interface:

```typescript
interface CheckFunctionResult {
  implemented: boolean;              // Whether the feature is implemented
  details?: Record<string, any>;     // Optional details about the implementation
}

type CheckFunction = (
  participantId: string,             // Unique ID of the participant
  stackName: string                  // CloudFormation stack name
) => Promise<CheckFunctionResult>;
```

## Security Considerations

### IAM Permissions

The assessment engine Lambda needs permissions to:
- Read from the S3 bucket containing challenges
- Read from the challenge registry DynamoDB table
- Write to the assessment results DynamoDB table
- Evaluate AWS resources (CloudFormation, DynamoDB, etc.)

### Code Execution Security

Since the system dynamically loads and executes JavaScript code from S3:
1. Strictly control who can upload to the challenges S3 bucket
2. Consider implementing code scanning before execution
3. Run check functions with appropriate timeouts and memory limits
4. Implement proper error handling to prevent one challenge from affecting others

### Data Isolation

Each participant's resources are identified by their unique participant ID to ensure:
- Participants can only access their own resources
- Assessment results are properly isolated
- Challenges don't interfere with each other

## Troubleshooting

### Common Issues

1. **Check functions timeout**: Increase the Lambda timeout or optimize your code
2. **Permissions errors**: Check IAM roles and policies
3. **Challenge not found**: Verify the challenge is properly registered in DynamoDB
4. **Code execution errors**: Validate your check functions locally first

### Logging

All components use CloudWatch Logs with structured logging to aid debugging:

- Core Assessment Engine: `/aws/lambda/reliability-assessment-engine`
- Challenge Management API: `/aws/lambda/challenge-management-api`
- CLI Tool: Local logs in `~/.ctf-challenge/logs/`

---

For more information or to contribute to this project, please visit the [GitHub repository](https://github.com/your-org/dynamic-challenge-engine).
