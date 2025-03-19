// reliability-assessment-trigger.js - Handles all trigger events for reliability assessments
const AWS = require('aws-sdk');

// Initialize AWS SDK clients
const lambda = new AWS.Lambda();
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const cloudformation = new AWS.CloudFormation();

/**
 * Main handler for processing assessment trigger events
 * Supports scheduled triggers, CloudFormation change events, and manual API calls
 */
exports.handler = async (event) => {
  console.log('Assessment trigger received event:', JSON.stringify(event, null, 2));

  try {
    // Extract trigger source
    const source = identifyEventSource(event);
    console.log(`Identified event source: ${source}`);

    // Extract participant IDs based on the event source
    const participantIds = await extractParticipantIds(event, source);
    
    if (!participantIds || participantIds.length === 0) {
      console.log('No participants to assess');
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'No participants to assess'
        })
      };
    }

    console.log(`Will assess ${participantIds.length} participants: ${participantIds.join(', ')}`);

    // Invoke assessment Lambda for each participant
    const results = await Promise.all(
      participantIds.map(participantId => triggerAssessment(participantId, source))
    );

    // Log summary of triggered assessments
    const successful = results.filter(r => r.status === 'triggered').length;
    const failed = results.filter(r => r.status === 'failed').length;

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Triggered ${successful} assessments (${failed} failed)`,
        source,
        results
      })
    };
  } catch (error) {
    console.error('Error in assessment trigger:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        stack: error.stack
      })
    };
  }
};

/**
 * Identifies the source of the trigger event
 */
function identifyEventSource(event) {
  // Check if it's a direct source specification
  if (event.source) {
    return event.source;
  }

  // Check if it's a scheduled CloudWatch Event
  if (event['detail-type'] === 'Scheduled Event') {
    return 'scheduled-event';
  }

  // Check if it's a CloudFormation change event
  if (event['detail-type'] === 'CloudFormation Stack Status Change') {
    return 'resource-change';
  }

  // Check if it's an API Gateway event
  if (event.httpMethod && event.path) {
    return 'manual-api';
  }

  // Default to unknown
  return 'unknown';
}

/**
 * Extracts participant IDs from the event based on its source
 */
async function extractParticipantIds(event, source) {
  switch (source) {
    case 'scheduled-event':
      // For scheduled events, get all active participants
      return getActiveParticipants();

    case 'resource-change':
      // For CloudFormation events, extract participant ID from stack name
      const stackId = event.detail?.stackId;
      if (!stackId) return [];

      const stackName = stackId.split('/')[1];
      if (!stackName || !stackName.startsWith('ctf-unreliable-app-')) {
        return [];
      }

      // Extract participant ID from stack name
      const participantId = stackName
        .replace('ctf-unreliable-app-', '')
        .split('-')[0];
      
      return [participantId];

    case 'manual-api':
      // For API Gateway events, extract participant ID from path parameter
      if (event.pathParameters && event.pathParameters.participantId) {
        return [event.pathParameters.participantId];
      } else if (event.participantId) {
        // Direct invocation with participantId
        return [event.participantId];
      }
      return [];

    default:
      console.log(`Unknown event source: ${source}`);
      return [];
  }
}

/**
 * Gets all active participants from the challenges table
 */
async function getActiveParticipants() {
  console.log('Getting active participants');
  
  try {
    // Query the challenges table for active participants
    const params = {
      TableName: process.env.CHALLENGES_TABLE,
      IndexName: 'StatusIndex', // GSI on status field
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'ACTIVE'
      },
      ProjectionExpression: 'participantId'
    };
    
    const result = await dynamoDB.query(params).promise();
    
    // Extract unique participant IDs
    const participantIds = [...new Set(
      result.Items.map(item => item.participantId)
    )];
    
    console.log(`Found ${participantIds.length} active participants`);
    return participantIds;
  } catch (error) {
    console.error('Error getting active participants:', error);
    
    // Fallback to scanning the stack list
    return getParticipantsFromStacks();
  }
}

/**
 * Fallback method to get participants by scanning CloudFormation stacks
 */
async function getParticipantsFromStacks() {
  console.log('Falling back to getting participants from CloudFormation stacks');
  
  try {
    const stacks = await cloudformation.listStacks({
      StackStatusFilter: [
        'CREATE_COMPLETE',
        'UPDATE_COMPLETE',
        'UPDATE_ROLLBACK_COMPLETE'
      ]
    }).promise();
    
    const participantIds = stacks.StackSummaries
      .filter(stack => stack.StackName.startsWith('ctf-unreliable-app-'))
      .map(stack => stack.StackName.replace('ctf-unreliable-app-', '').split('-')[0]);
    
    return [...new Set(participantIds)]; // Return unique IDs
  } catch (error) {
    console.error('Error getting participants from stacks:', error);
    return [];
  }
}

/**
 * Triggers the main assessment engine for a specific participant
 */
async function triggerAssessment(participantId, source) {
  console.log(`Triggering assessment for participant ${participantId} from source ${source}`);
  
  try {
    const params = {
      FunctionName: process.env.ASSESSMENT_ENGINE_FUNCTION,
      InvocationType: 'Event', // Asynchronous invocation
      Payload: JSON.stringify({
        participantId,
        source,
        timestamp: new Date().toISOString()
      })
    };
    
    const result = await lambda.invoke(params).promise();
    
    return {
      participantId,
      source,
      status: 'triggered',
      requestId: result.ResponseMetadata?.RequestId
    };
  } catch (error) {
    console.error(`Error triggering assessment for ${participantId}:`, error);
    
    return {
      participantId,
      source,
      status: 'failed',
      error: error.message
    };
  }
}

/**
 * Updates the last assessment timestamp for a participant
 * This helps prevent too-frequent assessments of the same participant
 */
async function updateLastAssessmentTime(participantId) {
  try {
    const params = {
      TableName: process.env.SYSTEM_METRICS_TABLE,
      Key: {
        metricId: 'last-assessment',
        participantId
      },
      UpdateExpression: 'set #timestamp = :time',
      ExpressionAttributeNames: {
        '#timestamp': 'timestamp'
      },
      ExpressionAttributeValues: {
        ':time': Date.now()
      }
    };
    
    await dynamoDB.update(params).promise();
  } catch (error) {
    console.error(`Error updating last assessment time for ${participantId}:`, error);
    // Non-critical error, continue anyway
  }
}