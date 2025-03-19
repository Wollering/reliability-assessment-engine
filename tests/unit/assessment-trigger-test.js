const AWS = require('aws-sdk-mock');
const trigger = require('../../src/reliability-assessment-trigger');

describe('Assessment Trigger', () => {
  beforeEach(() => {
    // Mock AWS Lambda invoke
    AWS.mock('Lambda', 'invoke', (params, callback) => {
      callback(null, { StatusCode: 202 });
    });
    
    // Mock DynamoDB query
    AWS.mock('DynamoDB.DocumentClient', 'query', (params, callback) => {
      callback(null, { 
        Items: [
          { participantId: 'test-user-1' },
          { participantId: 'test-user-2' }
        ]
      });
    });
  });
  
  afterEach(() => {
    AWS.restore();
  });
  
  test('should process scheduled event and trigger assessments', async () => {
    const event = {
      'detail-type': 'Scheduled Event',
      source: 'aws.events'
    };
    
    const result = await trigger.handler(event);
    expect(JSON.parse(result.body).message).toContain('Triggered 2 assessments');
  });
  
  // Add more tests for different event sources
});