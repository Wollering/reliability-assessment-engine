# Dynamic Challenge System for AWS Reliability CTF

A plug-and-play system that allows engineers to create and deploy AWS reliability challenges without modifying the core assessment engine.

## Overview

This system enables decentralized challenge development where different engineers can create AWS reliability challenges independently. Challenge-specific check functions are stored separately in S3 and loaded dynamically at runtime, eliminating the need to modify the main assessment engine.

## Architecture

The system consists of these key components:

1. **S3-Based Challenge Repository**
   - Each challenge stored in a dedicated S3 path
   - Standard structure for configuration and check functions
   - Versioning support for challenge iterations

2. **DynamoDB Challenge Registry**
   - Central database of all available challenges
   - Metadata about challenge location, difficulty, and status
   - Quick lookup for the assessment engine

3. **Dynamic Loading Assessment Engine**
   - Core Lambda that loads challenge definitions at runtime
   - Dynamically executes check functions from S3
   - No redeployment needed when adding new challenges

4. **Challenge Management API**
   - Endpoints for registering and managing challenges
   - Versioning and activation controls
   - Authentication for challenge developers

## Implementation Details

### Challenge Storage Structure

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

### Challenge Registry in DynamoDB

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

### Dynamic Loading Assessment Engine

The assessment engine loads challenge-specific code at runtime:

```javascript
// reliability-assessment.js
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
    
    // Continue with scoring and feedback...
  } catch (error) {
    console.error('Error in assessment:', error);
    throw error;
  }
};
```

### Loading Functions from S3

```javascript
async function loadCheckFunctionsFromS3(s3Location, checkFunctionsFile) {
  const s3 = new AWS.S3();
  const bucketName = s3Location.replace('s3://', '').split('/')[0];
  const keyPrefix = s3Location.replace(`s3://${bucketName}/`, '');
  
  const response = await s3.getObject({
    Bucket: bucketName,
    Key: `${keyPrefix}${checkFunctionsFile}`
  }).promise();
  
  // Convert buffer to string
  const functionCode = response.Body.toString('utf-8');
  
  // Create a module from the code string
  return requireFromString(functionCode);
}

// Helper function to require a string as a module
function requireFromString(src) {
  const Module = module.constructor;
  const m = new Module();
  m._compile(src, 'dynamic-module.js');
  return m.exports;
}
```

## Developer Workflow

1. **Create a Challenge Template**
   ```bash
   ctf-challenge create my-challenge
   ```

2. **Implement Check Functions**
   Edit `check-functions.js` to implement your assessment logic:
   ```javascript
   module.exports = {
     async checkMultiRegionDeployment(participantId, stackName) {
       // Your implementation here
       return { implemented: true, details: { /* details */ } };
     }
   };
   ```

3. **Test Locally**
   ```bash
   ctf-challenge test my-challenge --participantId test-user
   ```

4. **Upload When Ready**
   ```bash
   ctf-challenge upload my-challenge
   ```

## Security Considerations

- **IAM Permissions**: The assessment engine needs permissions to read from S3 and DynamoDB
- **Code Execution**: Be careful about running dynamically loaded code
- **Isolation**: Ensure challenges don't interfere with each other
- **Access Control**: Limit who can upload challenges to S3

## Benefits

- **Decoupled Development**: Engineers create challenges independently
- **Isolation**: Errors in one challenge don't affect others
- **Versioning**: Support multiple versions of challenges
- **Simplified Workflow**: No need to understand engine internals
- **No Redeployment**: Add new challenges without updating the core engine

## Setup Instructions

1. **Deploy Core Infrastructure**
   ```bash
   npm run deploy:core
   ```

2. **Configure CLI Tool**
   ```bash
   npm install -g ctf-challenge-cli
   ```

3. **Create Your First Challenge**
   ```bash
   ctf-challenge create my-first-challenge
   cd my-first-challenge
   # Edit config.json and check-functions.js
   ctf-challenge upload
   ```

4. **Verify Challenge Registration**
   ```bash
   ctf-challenge list
   ```

Now you're ready to create and deploy challenges without touching the core assessment engine!
