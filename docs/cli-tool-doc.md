# CLI Tool for AWS Reliability CTF Challenges

A command-line interface tool that simplifies creation, testing, and management of AWS reliability challenges for the Dynamic Challenge Assessment Engine.

## Overview

The CLI (Command Line Interface) tool provides challenge developers with a streamlined workflow for creating, testing, and publishing reliability challenges without directly interacting with the underlying AWS services or APIs. It abstracts away the complexities of S3 storage, API calls, and AWS authentication to provide a simple, consistent interface for engineers.

## Table of Contents

1. [Installation](#installation)
2. [Architecture Context](#architecture-context)
3. [Tool Structure](#tool-structure)
4. [Commands and Usage](#commands-and-usage)
5. [Challenge Development Workflow](#challenge-development-workflow)
6. [Local Testing](#local-testing)
7. [Configuration](#configuration)
8. [Authentication](#authentication)
9. [Integration with Other Components](#integration-with-other-components)
10. [Advanced Features](#advanced-features)
11. [Troubleshooting](#troubleshooting)

## Installation

### Prerequisites

- Node.js 14.x or higher
- AWS CLI installed and configured
- AWS account with appropriate permissions

### Install the CLI Tool

```bash
# Clone the repository
git clone https://github.com/your-org/ctf-challenge-cli.git
cd ctf-challenge-cli

# Install dependencies
npm install

# Link the CLI tool globally
npm link

# Verify installation
ctf-challenge --version
```

### Update to Latest Version

```bash
# Pull latest changes
git pull origin main

# Update dependencies
npm install

# Re-link if necessary
npm link
```

## Architecture Context

The CLI tool is a client-side component that serves as the primary interface between challenge developers and the backend infrastructure of the Dynamic Challenge Assessment Engine.

![Architecture Diagram](https://via.placeholder.com/800x400?text=Dynamic+Assessment+Engine+Architecture)

In the complete architecture:

1. **S3 Challenge Repository**: Stores challenge files
2. **Challenge Registry (DynamoDB)**: Contains challenge metadata
3. **Core Assessment Engine (Lambda)**: Runs assessments
4. **Challenge Management API**: Provides endpoints for managing challenges
5. **CLI Tool for Challenge Developers**: Creates a developer-friendly workflow

The CLI tool abstracts away the complexities of direct interaction with S3 and the Challenge Management API, providing a simplified workflow for challenge developers.

## Tool Structure

The CLI tool is built with a modular architecture:

```
ctf-challenge-cli/
├── bin/                        # Command entry points
│   └── ctf-challenge           # Main executable
├── src/
│   ├── commands/               # Command implementations
│   │   ├── create.js           # Challenge creation
│   │   ├── test.js             # Local testing
│   │   ├── upload.js           # Challenge upload
│   │   ├── update.js           # Challenge update
│   │   └── list.js             # List challenges
│   ├── utils/                  # Helper utilities
│   │   ├── api-client.js       # API communication
│   │   ├── aws-utils.js        # AWS SDK wrappers
│   │   ├── template-engine.js  # Template processing
│   │   └── validation.js       # Challenge validation
│   ├── templates/              # Challenge templates
│   │   ├── basic/              # Basic challenge template
│   │   └── advanced/           # Advanced challenge template
│   ├── runtime/                # Local testing runtime
│   │   ├── engine.js           # Assessment engine simulator
│   │   ├── aws-mocks.js        # AWS service mocks
│   │   └── vm-sandbox.js       # Secure execution environment
│   └── config.js               # Configuration management
├── package.json
└── README.md
```

## Commands and Usage

The CLI tool supports the following primary commands:

### Version

Display the CLI tool version:

```bash
ctf-challenge --version
```

### Help

Display help information:

```bash
ctf-challenge --help
```

### List Available Challenges

List all challenges in the registry:

```bash
ctf-challenge list [options]

Options:
  --status <status>     Filter by status (active, inactive, draft)
  --difficulty <level>  Filter by difficulty level
  --verbose             Show detailed information
```

### Create a New Challenge

Create a new challenge with the provided template:

```bash
ctf-challenge create <challenge-name> [options]

Options:
  --template <template>  Use specific template (basic, advanced)
  --description <desc>   Short description of the challenge
  --difficulty <level>   Difficulty level (beginner, intermediate, advanced)
```

Example:

```bash
ctf-challenge create api-reliability --template basic --difficulty beginner
```

This creates a directory with the following structure:

```
api-reliability/
├── config.json               # Challenge configuration
├── check-functions.js        # Assessment logic
└── resources/                # Challenge-specific resources
```

### Test a Challenge Locally

Test check functions against a deployed test instance:

```bash
ctf-challenge test <challenge-dir> [options]

Options:
  --participantId <id>   Participant ID to test against
  --verbose              Show detailed output
  --mock                 Use mock AWS services instead of real ones
  --debug                Enable step-by-step debugging
```

Example:

```bash
ctf-challenge test api-reliability --participantId test-user-1
```

### Upload a Challenge

Upload and register a challenge with the system:

```bash
ctf-challenge upload <challenge-dir> [options]

Options:
  --activate             Immediately activate the challenge
  --message <message>    Commit message for this version
```

Example:

```bash
ctf-challenge upload api-reliability --activate
```

### Update an Existing Challenge

Update an existing challenge:

```bash
ctf-challenge update <challenge-dir> [options]

Options:
  --message <message>    Update message
  --activate             Ensure challenge is active after update
  --deactivate           Deactivate challenge after update
```

Example:

```bash
ctf-challenge update api-reliability --message "Fixed DynamoDB check function"
```

### Validate a Challenge

Validate challenge configuration and check functions without uploading:

```bash
ctf-challenge validate <challenge-dir>
```

### Export a Challenge Template

Export an existing challenge as a template for reuse:

```bash
ctf-challenge export <challenge-dir> <template-name>
```

## Challenge Development Workflow

The CLI tool facilitates a streamlined workflow for creating challenges:

### 1. Create a Challenge Template

Begin by creating a new challenge:

```bash
ctf-challenge create my-challenge
```

This generates the basic structure for your challenge with placeholder files.

### 2. Configure the Challenge

Edit the generated `config.json` file to define assessment criteria:

```json
{
  "challengeId": "my-challenge",
  "name": "My Reliability Challenge",
  "description": "Improve the reliability of a simple application",
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
    }
    // Additional criteria...
  ]
}
```

### 3. Implement Check Functions

Edit the `check-functions.js` file to implement the assessment logic:

```javascript
module.exports = {
  /**
   * Checks if the participant has enabled point-in-time recovery for DynamoDB
   */
  async checkDynamoDBBackups(participantId, stackName) {
    const AWS = require('aws-sdk');
    const dynamoDB = new AWS.DynamoDB();
    
    // Implementation logic here...
    
    return {
      implemented: true,
      details: {
        // Implementation details...
      }
    };
  },
  
  /**
   * Checks if the participant has implemented proper error handling
   */
  async checkErrorHandling(participantId, stackName) {
    // Implementation logic here...
  }
};
```

### 4. Deploy a Test Instance

Deploy a test instance for local testing:

```bash
# Use the deployment script in your challenge's resources
node resources/deploy-test-instance.js test-user-1
```

### 5. Test Locally

Test your check functions against the deployed test instance:

```bash
ctf-challenge test my-challenge --participantId test-user-1
```

### 6. Iterate and Improve

Based on test results, refine your check functions and configuration.

### 7. Upload When Ready

Once satisfied with your challenge, upload it to the system:

```bash
ctf-challenge upload my-challenge
```

### 8. Update as Needed

Make updates to your challenge as needed:

```bash
# After making changes
ctf-challenge update my-challenge
```

## Local Testing

The local testing capability is a powerful feature that allows challenge developers to validate their check functions before uploading them to the central repository.

### Testing Process

When you run the test command:

```bash
ctf-challenge test my-challenge --participantId test-user-1
```

The CLI tool performs the following steps:

1. **Setup**: Creates a temporary testing environment
2. **Load**: Loads your check functions and configuration
3. **Execute**: Runs each check function against the specified participant's resources
4. **Score**: Calculates a score based on the check results
5. **Report**: Generates a detailed report of the results

### Testing Modes

The CLI tool supports two testing modes:

#### Live Mode

Tests against actual AWS resources deployed for the participant:

```bash
ctf-challenge test my-challenge --participantId test-user-1
```

In this mode, the CLI tool:
- Uses your AWS credentials to interact with real AWS services
- Examines actual CloudFormation stacks, DynamoDB tables, Lambda functions, etc.
- Provides realistic testing against actual AWS resources

#### Mock Mode

Tests using simulated AWS services:

```bash
ctf-challenge test my-challenge --participantId test-user-1 --mock
```

In mock mode, the CLI tool:
- Creates mock AWS service responses
- Loads predefined mock data from files in `resources/mocks/`
- Intercepts AWS SDK calls and returns the mock responses
- Allows testing without any actual AWS resources

### Debug Mode

For more detailed testing, enable debug mode:

```bash
ctf-challenge test my-challenge --participantId test-user-1 --debug
```

This provides:
- Step-by-step execution
- Visualization of AWS service calls
- Interactive breakpoints
- Detailed execution logs

### Testing Output

The test command produces formatted output similar to:

```
Testing challenge: my-challenge
Participant ID: test-user-1

[✓] DynamoDB Point-in-Time Recovery (10/10 pts)
    Details: Point-in-time recovery is enabled for table test-user-1-items
    
[✗] API Error Handling (0/15 pts)
    Not implemented: Lambda function has insufficient timeout (3 seconds)
    
[✓] Lambda Dead Letter Queue (10/10 pts)
    Dead Letter Queue configured for Lambda function
    
[✗] API Gateway Throttling (0/10 pts)
    Not implemented: No throttling settings found on API Gateway
    
[✓] CloudWatch Alarms (15/15 pts)
    Implemented: Found CloudWatch alarms for API Gateway

Total Score: 35/60 (58%)
```

## Configuration

The CLI tool's behavior can be customized through configuration:

### Global Configuration

Global configuration is stored in `~/.ctf-challenge/config.json`:

```json
{
  "apiEndpoint": "https://api.ctf-platform.example.com",
  "region": "us-east-1",
  "defaultTemplate": "basic",
  "logLevel": "info",
  "profileName": "ctf-developer"
}
```

Edit global configuration:

```bash
ctf-challenge config set apiEndpoint https://api.ctf-platform.example.com
ctf-challenge config set region us-west-2
```

### Project-level Configuration

Each challenge directory can contain a `.ctf-challenge.json` file with project-specific settings:

```json
{
  "testParticipantId": "test-user-1",
  "mockResponses": {
    "dynamoDB": "./resources/mocks/dynamodb-responses.json"
  }
}
```

## Authentication

The CLI tool handles authentication with the Challenge Management API:

### Authentication Setup

```bash
# Log in to get authentication tokens
ctf-challenge login

# Alternatively, specify credentials directly
ctf-challenge login --username engineer --password mypassword
```

This process:
1. Authenticates with Amazon Cognito
2. Obtains JWT tokens
3. Stores tokens securely in the local keychain
4. Refreshes tokens automatically when needed

### AWS Credentials

For AWS operations, the CLI tool uses:
- The default AWS profile
- Or a specific profile if configured:

```bash
ctf-challenge config set profileName my-ctf-profile
```

## Integration with Other Components

### S3 Integration

The CLI tool manages the upload of challenge files to S3:

1. Packages challenge files
2. Requests pre-signed URLs from the API
3. Uploads files directly to S3
4. Verifies successful uploads

### API Integration

The CLI tool communicates with the Challenge Management API:

1. Authenticates users
2. Registers and updates challenges
3. Lists available challenges
4. Validates challenge configurations

### Assessment Engine Integration

The local testing runtime simulates the core assessment engine:

1. Uses the same execution environment
2. Follows the same assessment logic
3. Generates compatible results

## Advanced Features

### Challenge Templates

The CLI tool supports custom templates:

```bash
# List available templates
ctf-challenge templates list

# Create a custom template
ctf-challenge templates create my-template my-existing-challenge

# Use a custom template
ctf-challenge create new-challenge --template my-template
```

### Bulk Operations

For managing multiple challenges:

```bash
# Test multiple challenges
ctf-challenge test-all ./challenges-dir --participantId test-user-1

# Upload multiple challenges
ctf-challenge upload-all ./challenges-dir
```

### CI/CD Integration

The CLI tool can be integrated into CI/CD pipelines:

```bash
# Non-interactive mode
ctf-challenge upload my-challenge --activate --ci

# Output results in various formats
ctf-challenge test my-challenge --participantId test-user-1 --format json
```

### Plugins

Extend the CLI tool with plugins:

```bash
# Install a plugin
ctf-challenge plugins install my-plugin

# Use plugin features
ctf-challenge my-plugin-command
```

## Troubleshooting

### Logging

The CLI tool maintains logs in `~/.ctf-challenge/logs/`:

```bash
# Enable verbose logging
ctf-challenge --verbose test my-challenge --participantId test-user-1

# Output logs to a specific file
ctf-challenge test my-challenge --log-file ./test-results.log
```

### Common Issues

#### API Connection Issues

```
Error: Could not connect to API at https://api.example.com
```

Solutions:
- Check your internet connection
- Verify the API endpoint in your configuration
- Ensure your authentication token is valid

#### AWS Permission Issues

```
Error: Access denied when calling the DescribeTable operation
```

Solutions:
- Check your AWS credentials
- Verify that your IAM user has the necessary permissions
- Use the correct AWS profile

#### Check Function Errors

```
Error in check function 'checkDynamoDBBackups': Cannot read property 'TableName' of undefined
```

Solutions:
- Check for syntax errors in your check functions
- Verify that you're handling edge cases properly
- Use the `--debug` flag to step through execution

### Getting Help

```bash
# Show general help
ctf-challenge --help

# Show command-specific help
ctf-challenge test --help

# Check CLI version
ctf-challenge --version
```

---

This document provides a comprehensive overview of the CLI Tool component within the Dynamic Challenge Assessment Engine. Engineers can use this information to create, test, and publish AWS reliability challenges efficiently.

For detailed implementation information, refer to the source code in the repository.
