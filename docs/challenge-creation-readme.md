# Creating AWS Reliability CTF Challenges

This guide provides step-by-step instructions for creating AWS Well-Architected Reliability Pillar challenges for your CTF platform. Follow these instructions to design, document, implement, and score reliability-focused challenges.

## Table of Contents
1. [Challenge Design Process](#challenge-design-process)
2. [Documenting the Architecture](#documenting-the-architecture)
3. [Implementation with CloudFormation](#implementation-with-cloudformation)
4. [Setting Up the Assessment Engine](#setting-up-the-assessment-engine)
5. [Scoring Methodology](#scoring-methodology)
6. [Testing Your Challenge](#testing-your-challenge)
7. [Participant Experience](#participant-experience)

## Challenge Design Process

### Step 1: Define Learning Objectives
Start by clearly defining what you want participants to learn about AWS reliability:

```
Learning objectives:
- Understand multi-region deployment strategies
- Implement proper error handling and retry mechanisms
- Configure appropriate CloudWatch alarms and monitoring
- Design for graceful degradation during failures
- Implement asynchronous processing patterns
```

### Step 2: Choose Reliability Focus Areas
Select specific reliability patterns to focus on from the AWS Well-Architected Framework:

- Fault Isolation
- Auto Recovery
- Data Backup and Replication
- Monitoring and Alerting
- Throttling and Circuit Breakers
- Idempotency and Safe Retries

### Step 3: Design the Challenge Scenario
Create a realistic scenario with reliability issues:

Example:
```
Scenario: "Reliable Voting System"
A high-profile online voting system is experiencing reliability issues during peak traffic. 
Users report timeouts, data inconsistencies, and system unavailability during high-demand periods.
```

## Documenting the Architecture

### Step 1: Document the Current (Unreliable) Architecture
Create detailed documentation of the deliberately unreliable starting architecture:

1. Create an architecture diagram using draw.io or Lucidchart showing:
   - AWS resources and their relationships
   - Data flow
   - User interaction points
   - Deliberately unreliable components

2. Document known reliability issues:
```
Known issues:
- Single-region deployment
- Synchronous processing of votes
- No error handling or retry logic
- Missing CloudWatch alarms
- No health checks or circuit breakers
```

### Step 2: Document the Target (Reliable) Architecture
Describe the ideal architecture that would resolve all reliability issues:

1. Create a target architecture diagram showing:
   - Multi-region configuration
   - Async processing components
   - Monitoring setup
   - Recovery mechanisms

2. Create a scoring checklist of reliability improvements:
```
Reliability improvements:
[10 pts] Multi-region deployment
[10 pts] DynamoDB point-in-time recovery
[15 pts] Error handling and retry logic
[10 pts] CloudWatch alarms for critical metrics
[15 pts] Idempotent API operations
[10 pts] Asynchronous processing with SQS
[10 pts] Circuit breaker pattern
[10 pts] Health checks for dependencies
[10 pts] Load testing implementation
```

## Implementation with CloudFormation

### Step 1: Create the Base Template
Develop the unreliable base template that participants will need to improve:

```yaml
# unreliable-app-template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'CTF Challenge - Unreliable Voting Application (Starting Point)'

Resources:
  # Deliberately unreliable single-region setup
  VotesTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub ${AWS::StackName}-votes
      BillingMode: PAY_PER_REQUEST
      # Missing point-in-time recovery
      KeySchema:
        - AttributeName: voteId
          KeyType: HASH
      AttributeDefinitions:
        - AttributeName: voteId
          AttributeType: S
      # No global tables configuration

  # Function with reliability issues
  VotingFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub ${AWS::StackName}-voting-function
      Handler: app.handler
      Runtime: nodejs14.x
      # No reserved concurrency
      # No retry configuration
      # No DLQ
      Code:
        ZipFile: |
          exports.handler = async (event) => {
            // Missing error handling
            // Direct synchronous processing
            // No retry logic
            // ... add deliberately unreliable code here
          }
```

### Step 2: Create a Deployment Script
Develop a script to deploy a unique instance for each participant:

```javascript
// deploy-challenge.js
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const { execSync } = require('child_process');

// Function to deploy per-participant instance
async function deployForParticipant(participantId) {
  console.log(`Deploying for participant: ${participantId}`);
  
  // Create stack name with participant ID
  const stackName = `reliability-challenge-${participantId}`;
  
  // Deploy CloudFormation template with participant-specific parameters
  execSync(`aws cloudformation deploy \
    --template-file unreliable-app-template.yaml \
    --stack-name ${stackName} \
    --parameter-overrides \
      ParticipantId=${participantId} \
    --capabilities CAPABILITY_NAMED_IAM`);
    
  console.log(`Deployment complete: ${stackName}`);
  return stackName;
}

// Usage
if (require.main === module) {
  const participantId = process.argv[2] || uuidv4().substring(0, 8);
  deployForParticipant(participantId)
    .then(stackName => console.log(`Stack: ${stackName}`))
    .catch(err => console.error('Deployment failed:', err));
}
```

### Step 3: Create Reference Solution Template
Develop a reference solution showing all expected reliability improvements:

```yaml
# reference-solution.yaml (not shared with participants)
AWSTemplateFormatVersion: '2010-09-09'
Description: 'CTF Challenge - Reliable Voting Application (Reference Solution)'

Resources:
  # Reliable multi-region setup
  VotesTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub ${AWS::StackName}-votes
      BillingMode: PAY_PER_REQUEST
      PointInTimeRecoverySpecification:
        PointInTimeRecoveryEnabled: true
      # Additional reliability configurations...
  
  # Additional resources for reliability
  VotesDLQ:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub ${AWS::StackName}-votes-dlq
      # DLQ configuration...
      
  # CloudWatch Alarms
  HighErrorRateAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      # Alarm configuration...
```

## Setting Up the Assessment Engine

### Step 1: Configure the Assessment Engine
Set up the assessment engine to evaluate participant solutions:

1. Create a configuration file for your challenge:

```javascript
// reliability-challenge-config.js
module.exports = {
  challengeId: 'reliability-voting-system',
  description: 'AWS Well-Architected Reliability Challenge',
  stackNamePrefix: 'reliability-challenge-',
  assessmentCriteria: [
    {
      id: 'multi-region',
      name: 'Multi-Region Deployment',
      points: 10,
      checkFunction: 'checkMultiRegionDeployment'
    },
    {
      id: 'dynamodb-backup',
      name: 'DynamoDB Point-in-Time Recovery',
      points: 10,
      checkFunction: 'checkDynamoDBBackups'
    },
    // Additional criteria...
  ]
};
```

2. Implement the check functions for your specific challenge:

```javascript
// challenge-specific-checks.js
async function checkMultiRegionDeployment(participantId, stackName) {
  // Implementation specific to this challenge
  // Check for global tables or multi-region resources
}

async function checkDynamoDBBackups(participantId, stackName) {
  // Challenge-specific implementation
  // Check for point-in-time recovery configuration
}

// Additional check functions...
```

### Step 2: Register the Challenge
Add your challenge to the assessment engine:

```javascript
// register-challenge.js
const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

async function registerChallenge() {
  const params = {
    TableName: 'ctf-challenges',
    Item: {
      challengeId: 'reliability-voting-system',
      name: 'Reliable Voting System',
      description: 'Improve the reliability of a voting system during peak traffic',
      category: 'aws-well-architected',
      difficulty: 'intermediate',
      timeEstimate: '120',
      maxScore: 100,
      active: true
    }
  };
  
  await dynamoDB.put(params).promise();
  console.log('Challenge registered successfully');
}

registerChallenge().catch(console.error);
```

## Scoring Methodology

### Step 1: Define Scoring Categories and Weights
Create a scoring breakdown based on reliability patterns:

| Category | Weight | Description |
|----------|--------|-------------|
| Infrastructure Resilience | 35% | Multi-region, backups, high availability |
| Error Handling | 25% | Retry logic, circuit breakers, timeouts |
| Monitoring and Observability | 20% | Alarms, dashboards, logging |
| Performance Efficiency | 20% | Async processing, throttling, caching |

### Step 2: Implement the Scoring Logic
Code the scoring system to evaluate and weight each reliability pattern:

```javascript
function calculateReliabilityScore(assessmentResults) {
  // Define category weights
  const weights = {
    infrastructure: 0.35,
    errorHandling: 0.25,
    monitoring: 0.20,
    performance: 0.20
  };
  
  // Calculate category scores
  const categoryScores = {
    infrastructure: calculateInfrastructureScore(assessmentResults),
    errorHandling: calculateErrorHandlingScore(assessmentResults),
    monitoring: calculateMonitoringScore(assessmentResults),
    performance: calculatePerformanceScore(assessmentResults)
  };
  
  // Calculate weighted total
  let totalScore = 0;
  for (const [category, weight] of Object.entries(weights)) {
    totalScore += categoryScores[category] * weight;
  }
  
  return Math.round(totalScore);
}
```

### Step 3: Create the Feedback Generator
Develop a mechanism to provide educational feedback based on assessment results:

```javascript
function generateFeedback(assessmentResults, reliabilityScore) {
  const feedback = {
    score: reliabilityScore,
    passed: reliabilityScore >= 80,
    improvements: [],
    suggestions: []
  };
  
  // Add implemented improvements
  assessmentResults.forEach(result => {
    if (result.implemented) {
      feedback.improvements.push(`✅ ${result.name}: Good job implementing ${result.description}`);
    } else {
      feedback.suggestions.push(`❌ ${result.name}: Consider ${result.suggestion}`);
    }
  });
  
  return feedback;
}
```

## Testing Your Challenge

### Step 1: Deploy a Test Instance
Set up a test instance to verify your challenge:

```bash
# Deploy a test instance
node deploy-challenge.js test-admin
```

### Step 2: Run Through the Challenge
Complete the challenge as a participant would:

1. Apply the reliable improvements to your test instance
2. Implement each reliability pattern one by one
3. Run the assessment engine after each improvement
4. Verify the score increases appropriately

### Step 3: Validate Scoring
Test the scoring system against various implementation qualities:

1. Deploy multiple test instances with different levels of reliability
2. Run the assessment engine against each
3. Verify scores correlate with the reliability level
4. Ensure the feedback is helpful and educational

## Participant Experience

### Step 1: Create Challenge Instructions
Develop detailed instructions for participants:

```markdown
# Reliable Voting System Challenge

## Scenario
You've been hired to improve the reliability of a high-profile voting system 
that's experiencing issues during peak traffic periods. The current implementation 
has several reliability weaknesses that you need to identify and fix.

## Objective
Improve the voting system's reliability by implementing AWS Well-Architected 
Reliability Pillar best practices. You need to achieve a reliability score of 
at least 80 to pass this challenge.

## Getting Started
1. Your deployment is available at: {participant-specific-endpoint}
2. Examine the current architecture and identify reliability issues
3. Implement improvements using CloudFormation
4. Use the assessment tool to check your progress

## Hints
- Consider how to handle cross-region resilience
- Think about what happens when components fail
- Don't forget to monitor critical components
- Consider asynchronous processing for high-volume operations
```

### Step 2: Provide Learning Resources
Include resources to help participants learn about reliability best practices:

```markdown
## Learning Resources
- [AWS Well-Architected Reliability Pillar](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/welcome.html)
- [DynamoDB Global Tables](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GlobalTables.html)
- [CloudWatch Alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html)
- [Implementing Circuit Breaker Pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/implement-the-circuit-breaker-pattern-in-a-serverless-environment-with-aws-lambda.html)
```

### Step 3: Set Up Progress Tracking
Create a dashboard for participants to track their progress:

```javascript
// get-participant-progress.js
async function getProgress(participantId) {
  const params = {
    TableName: 'ctf-participant-progress',
    Key: {
      challengeId: 'reliability-voting-system',
      participantId
    }
  };
  
  const result = await dynamoDB.get(params).promise();
  
  return {
    currentScore: result.Item?.score || 0,
    improvements: result.Item?.improvements || [],
    remaining: result.Item?.suggestions || [],
    lastAssessment: result.Item?.lastUpdated || null
  };
}
```

---

By following these steps, you'll create a comprehensive AWS Reliability CTF challenge that educates participants on AWS Well-Architected best practices while providing a fun and engaging experience.

For additional support or to contribute new challenges, please contact the CTF platform team.
