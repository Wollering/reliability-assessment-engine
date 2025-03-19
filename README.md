# Reliability Assessment Engine

A serverless application that automatically evaluates AWS infrastructure for compliance with the Well-Architected Reliability Pillar. This engine is specifically designed for Capture The Flag (CTF) challenges focused on AWS reliability best practices.

## Overview

The Reliability Assessment Engine analyzes CloudFormation stacks, AWS resources, and Lambda code to evaluate how well participants have implemented AWS reliability patterns. It calculates a reliability score based on best practices from the AWS Well-Architected Framework and provides detailed feedback for improvement.

## Features

- **Automated Assessment**: Regularly evaluates participant resources for reliability improvements
- **Event-Driven Architecture**: Triggered by scheduled events, resource changes, or manual API calls
- **Comprehensive Analysis**: Examines infrastructure, code, and monitoring practices
- **Educational Feedback**: Provides specific suggestions for enhancing reliability
- **Scoring System**: Quantifies reliability with a numerical score from 0-100

## Architecture

The engine consists of two primary Lambda functions:

1. **Assessment Trigger** (`reliability-assessment-trigger.js`): Front-door that processes events from different sources and invokes the main assessment engine for each participant
2. **Assessment Engine** (`reliability-assessment-engine.js`): Core logic that analyzes participant resources and calculates reliability scores

Supporting modules include:
- `stack-analyzer.js`: Examines CloudFormation templates for reliability patterns
- `code-analyzer.js`: Analyzes Lambda function code for error handling and resilience
- `metrics-analyzer.js`: Evaluates CloudWatch metrics and alarms

## Prerequisites

- Node.js 14.x or higher
- AWS CLI configured with appropriate permissions
- Serverless Framework

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/reliability-assessment-engine.git
   cd reliability-assessment-engine
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Deploy to AWS:
   ```bash
   npm run deploy
   ```

## Usage

The assessment engine can be triggered in three ways:

1. **Scheduled Assessment**: Runs automatically every 15 minutes
2. **Resource Change**: Triggered when a participant updates their CloudFormation stack
3. **Manual API Call**: Invoke through the provided API endpoint

### Manual API Testing

```bash
# Trigger assessment for a specific participant
curl -X POST https://your-api-id.execute-api.us-east-1.amazonaws.com/dev/assess/participantId
```

## Testing

Run the test suite:
```bash
npm test
```

For local testing without deploying:
```bash
npm run local
```

## Challenge Setup

To set up a new reliability challenge:

1. Deploy the baseline unreliable application for a participant:
   ```bash
   node deploy-test-challenge.js participantId
   ```

2. Provide the participant with access to their resources and the improvement guide
3. Monitor their progress through the assessment reports

## Development

### Project Structure

```
reliability-assessment-engine/
├── src/
│   ├── reliability-assessment-engine.js   # Main assessment logic
│   ├── reliability-assessment-trigger.js  # Trigger handler
│   └── utils/
│       ├── stack-analyzer.js              # CloudFormation analysis
│       ├── code-analyzer.js               # Lambda code analysis
│       └── metrics-analyzer.js            # CloudWatch metrics analysis
├── templates/
│   └── reliability-engine-cf.yaml         # CloudFormation template
├── tests/
│   ├── unit/                              # Unit tests
│   └── integration/                       # Integration tests
├── package.json
└── serverless.yml                         # Serverless configuration
```

### Extending the Engine

To add new reliability checks:

1. Add a new check function to the appropriate analyzer module
2. Update the main assessment engine to include the new check
3. Adjust the scoring weights if necessary
4. Deploy the updated engine

## Troubleshooting

Common issues:

- **Missing DynamoDB Tables**: Ensure tables are created before running assessments
- **Lambda Timeout**: Increase the timeout setting for complex assessments
- **Permission Errors**: Verify IAM roles have appropriate permissions

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- AWS Well-Architected Framework
- Serverless Framework
- AWS SDK for JavaScript
