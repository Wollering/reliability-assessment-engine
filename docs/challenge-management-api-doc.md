# Challenge Management API

A RESTful API service that enables decentralized development of AWS Reliability CTF challenges by providing endpoints for registering, updating, and managing challenges.

## Overview

The Challenge Management API is a critical middleware component in the Dynamic Challenge Assessment Engine architecture. It provides a controlled gateway for challenge developers to register and manage their challenges without directly modifying the core assessment engine or database.

This document explains the API's role, implementation details, and usage patterns for engineers working with the AWS Reliability CTF platform.

## Table of Contents

1. [Architecture Context](#architecture-context)
2. [API Implementation](#api-implementation)
3. [API Endpoints](#api-endpoints)
4. [Authentication and Authorization](#authentication-and-authorization)
5. [Request/Response Formats](#requestresponse-formats)
6. [Error Handling](#error-handling)
7. [Integration with Other Components](#integration-with-other-components)
8. [Usage Patterns](#usage-patterns)
9. [Deployment](#deployment)
10. [Monitoring and Logging](#monitoring-and-logging)

## Architecture Context

The Challenge Management API fits into the overall Dynamic Challenge Assessment Engine architecture as follows:

![Architecture Diagram](https://via.placeholder.com/800x400?text=Dynamic+Assessment+Engine+Architecture)

The architecture consists of:

1. **S3 Challenge Repository**: Stores challenge files (code, configurations, resources)
2. **Challenge Registry (DynamoDB)**: Contains metadata about available challenges
3. **Core Assessment Engine (Lambda)**: Dynamically loads and executes check functions
4. **Challenge Management API**: Provides endpoints for managing challenges
5. **CLI Tool for Challenge Developers**: Provides a developer-friendly interface to the API

The API serves as the controlled gateway that allows engineers to register and manage challenges without directly modifying the assessment engine or database. It maintains the decoupling between challenge development and the core assessment infrastructure.

## API Implementation

The Challenge Management API is implemented as a serverless application using:

- **AWS API Gateway**: Exposes the RESTful endpoints
- **AWS Lambda Functions**: Contain the business logic for managing challenges
- **Amazon DynamoDB**: Stores challenge metadata
- **AWS S3**: Manages challenge file storage
- **AWS IAM**: Controls access to the API and other AWS resources

### AWS Service Configuration

The API is deployed using the AWS Serverless Application Model (SAM) with the following resources:

```yaml
# template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Challenge Management API for AWS Reliability CTF

Resources:
  ChallengeManagementApi:
    Type: AWS::Serverless::Api
    Properties:
      StageName: Prod
      Auth:
        DefaultAuthorizer: CognitoAuthorizer
        Authorizers:
          CognitoAuthorizer:
            UserPoolArn: !GetAtt ChallengeUserPool.Arn

  # API Lambda Functions
  GetChallengesFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/handlers/
      Handler: getChallenges.handler
      Runtime: nodejs14.x
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref ChallengeRegistry
      Events:
        ApiEvent:
          Type: Api
          Properties:
            RestApiId: !Ref ChallengeManagementApi
            Path: /challenges
            Method: GET

  # Additional functions for other endpoints...

  # DynamoDB Challenge Registry
  ChallengeRegistry:
    Type: AWS::DynamoDB::Table
    Properties:
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: challengeId
          AttributeType: S
      KeySchema:
        - AttributeName: challengeId
          KeyType: HASH
      StreamSpecification:
        StreamViewType: NEW_AND_OLD_IMAGES

  # Cognito User Pool for Authentication
  ChallengeUserPool:
    Type: AWS::Cognito::UserPool
    Properties:
      UserPoolName: ChallengeManagementUsers
      # Additional user pool configuration...

  # S3 Bucket for Challenge Files
  ChallengeBucket:
    Type: AWS::S3::Bucket
    Properties:
      VersioningConfiguration:
        Status: Enabled
      CorsConfiguration:
        CorsRules:
          - AllowedHeaders: ['*']
            AllowedMethods: [GET, PUT, POST, DELETE, HEAD]
            AllowedOrigins: ['*']
            MaxAge: 3000
```

## API Endpoints

The Challenge Management API exposes the following endpoints:

### List Challenges

```
GET /challenges
```

Returns a list of all challenges, optionally filtered by status, difficulty, or category.

**Query Parameters:**
- `status` (optional): Filter by status (active, inactive, draft)
- `difficulty` (optional): Filter by difficulty level
- `category` (optional): Filter by challenge category

**Response:**
```json
{
  "challenges": [
    {
      "challengeId": "reliability-voting-system",
      "name": "Reliable Voting System",
      "description": "Improve a voting system's reliability during peak traffic",
      "difficulty": "intermediate",
      "status": "active"
    },
    ...
  ]
}
```

### Get Challenge Details

```
GET /challenges/{challengeId}
```

Returns detailed information about a specific challenge.

**Response:**
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
  "createdAt": "2023-05-15T14:30:00Z",
  "lastUpdated": "2023-05-20T09:15:00Z"
}
```

### Register New Challenge

```
POST /challenges
```

Registers a new challenge in the system.

**Request Body:**
```json
{
  "challengeId": "api-reliability",
  "name": "API Reliability Challenge",
  "description": "Improve the reliability of an API service",
  "s3Location": "s3://ctf-reliability-challenges/api-reliability/",
  "configFile": "config.json",
  "checkFunctionsFile": "check-functions.js",
  "difficulty": "beginner"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Challenge registered successfully",
  "challengeId": "api-reliability"
}
```

### Update Challenge

```
PUT /challenges/{challengeId}
```

Updates an existing challenge.

**Request Body:**
```json
{
  "name": "Updated API Reliability Challenge",
  "description": "New description for the API challenge",
  "active": true
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Challenge updated successfully",
  "challengeId": "api-reliability"
}
```

### Delete Challenge

```
DELETE /challenges/{challengeId}
```

Deletes a challenge from the registry.

**Response:**
```json
{
  "status": "success",
  "message": "Challenge deleted successfully"
}
```

### Generate Pre-signed S3 Upload URL

```
POST /challenges/{challengeId}/upload
```

Generates a pre-signed URL for uploading challenge files to S3.

**Request Body:**
```json
{
  "fileName": "check-functions.js",
  "contentType": "application/javascript"
}
```

**Response:**
```json
{
  "uploadUrl": "https://ctf-reliability-challenges.s3.amazonaws.com/...",
  "expiresIn": 3600
}
```

### Validate Challenge

```
POST /challenges/{challengeId}/validate
```

Validates the challenge configuration and check functions.

**Response:**
```json
{
  "status": "success",
  "message": "Challenge validation successful",
  "issues": []
}
```

## Authentication and Authorization

The Challenge Management API uses Amazon Cognito for authentication and AWS IAM for authorization.

### Authentication

- API calls must include a valid JWT token from the Cognito User Pool
- The token must be included in the `Authorization` header
- Tokens are obtained through the Cognito authentication flow

### Authorization

- IAM policies control which users can perform which actions
- Policies are defined at the user or group level
- Example policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "challenge-api:ListChallenges",
        "challenge-api:GetChallenge"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "challenge-api:RegisterChallenge",
        "challenge-api:UpdateChallenge",
        "challenge-api:DeleteChallenge"
      ],
      "Resource": "arn:aws:challenge-api:*:*:challenge/prefix-${aws:username}-*"
    }
  ]
}
```

This policy allows all authenticated users to list and view challenges, but only allows them to register, update, or delete challenges that include their username in the challenge ID.

## Request/Response Formats

All API endpoints follow these conventions:

### Request Format

- Content-Type: `application/json`
- Authentication: Bearer token in `Authorization` header
- JSON-formatted request body for POST and PUT requests

### Response Format

All responses have a standardized format:

```json
{
  "status": "success|error",
  "message": "Human-readable message",
  "data": {
    // Optional response data
  },
  "errors": [
    // Optional array of error objects if status is "error"
    {
      "code": "ERROR_CODE",
      "message": "Detailed error message"
    }
  ]
}
```

## Error Handling

The API uses HTTP status codes and standardized error responses:

- **400 Bad Request**: Invalid request format or parameters
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Authenticated but not authorized
- **404 Not Found**: Resource not found
- **409 Conflict**: Resource already exists
- **500 Internal Server Error**: Server-side error

Error response example:

```json
{
  "status": "error",
  "message": "Challenge validation failed",
  "errors": [
    {
      "code": "INVALID_CHECK_FUNCTION",
      "message": "Check function 'checkMultiRegionDeployment' has syntax errors",
      "details": {
        "line": 24,
        "column": 36,
        "error": "Unexpected token '='"
      }
    }
  ]
}
```

## Integration with Other Components

### S3 Integration

The API manages the lifecycle of challenge files in S3:

1. Generates pre-signed URLs for file uploads
2. Validates uploaded files
3. Manages file versioning
4. Controls access to files

### DynamoDB Integration

The API performs CRUD operations on the Challenge Registry in DynamoDB:

1. Creates new challenge records
2. Retrieves challenge metadata
3. Updates challenge attributes
4. Removes challenge entries

### Assessment Engine Integration

The API notifies the Assessment Engine when challenges are updated:

1. Publishes events to SNS topics
2. Updates cached challenge metadata
3. Triggers revalidation of challenge configurations

## Usage Patterns

### Direct API Usage

While possible, directly calling the API endpoints is rare. Most interaction happens through the CLI tool.

Example with curl:

```bash
# Get an authentication token
TOKEN=$(aws cognito-idp initiate-auth \
  --client-id 1exampleclientid \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=engineer,PASSWORD=password \
  --query 'AuthenticationResult.IdToken' \
  --output text)

# List all challenges
curl -H "Authorization: Bearer $TOKEN" \
  https://api.example.com/challenges

# Register a new challenge
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"challengeId":"new-challenge","name":"New Challenge",...}' \
  https://api.example.com/challenges
```

### CLI Tool Integration

The CLI tool abstracts away the API calls for a better developer experience:

```bash
# List challenges
ctf-challenge list

# Create a new challenge
ctf-challenge create my-challenge

# Upload the challenge
ctf-challenge upload my-challenge

# Update an existing challenge
ctf-challenge update my-challenge
```

Internally, the CLI tool:

1. Manages authentication with Cognito
2. Packages challenge files for upload
3. Makes API calls to register and update challenges
4. Handles error responses and provides helpful feedback

## Deployment

The Challenge Management API can be deployed using AWS SAM or CloudFormation:

```bash
# Deploy with SAM
sam build
sam deploy --guided

# Deploy with CloudFormation
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name challenge-management-api \
  --capabilities CAPABILITY_IAM
```

### Deployment Environments

The API can be deployed to multiple environments:

- **Development**: For testing new API features
- **Staging**: For pre-release validation
- **Production**: For real challenge management

Each environment has its own:
- API Gateway endpoint
- Lambda functions
- DynamoDB tables
- S3 buckets
- Cognito user pools

### CI/CD Pipeline

A CI/CD pipeline automates deployment:

1. Code changes are pushed to the repository
2. Tests run automatically
3. Build artifacts are created
4. CloudFormation templates are validated
5. Deployment occurs to the appropriate environment

## Monitoring and Logging

### CloudWatch Metrics

The API publishes metrics to CloudWatch:

- **API Gateway**: Request count, latency, errors
- **Lambda**: Invocation count, duration, errors
- **DynamoDB**: Read/write throughput, throttling
- **Custom Metrics**: Challenge registration rate, validation success rate

### Logging

All API operations are logged:

- Lambda function logs go to CloudWatch Logs
- API Gateway access logs record all requests
- DynamoDB operations are tracked in CloudTrail
- S3 bucket access is logged to a separate bucket

Example log queries:

```
# Find failed challenge registrations
filter @message like "Challenge registration failed"

# Track API usage by user
filter @message like "API request" | stats count() by user, operation

# Monitor validation errors
filter @message like "Validation error" | parse @message "function: * error: *" as function, error
```

### Alerts

CloudWatch Alarms monitor the API health:

- High error rates trigger notifications
- Latency spikes trigger scaling events
- Authentication failures trigger security alerts
- Resource usage triggers cost optimization reviews

---

This document provides an overview of the Challenge Management API component within the Dynamic Challenge Assessment Engine. Engineers can use this information to understand how the API works and how to interact with it using the CLI tool.

For detailed implementation information, refer to the source code in the `api/` directory.
