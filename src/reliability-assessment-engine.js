const AWS = require('aws-sdk');
const stackAnalyzer = require('./utils/stack-analyzer');

// Initialize AWS SDK clients
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

/**
 * Main handler for the assessment engine
 */
exports.handler = async (event) => {
  console.log('Assessment event received:', JSON.stringify(event));
  
  // Extract participant ID from event
  const participantId = event.participantId;
  if (!participantId) {
    throw new Error('Missing participantId');
  }
  
  try {
    // 1. Analyze the participant's CloudFormation stack
    const stackName = `ctf-unreliable-app-${participantId}-dev`;
    const stackAnalysis = await stackAnalyzer.analyzeStack(stackName);
    
    // 2. Calculate reliability score (simplified)
    const reliabilityScore = calculateScore(stackAnalysis);
    
    // 3. Update the score in DynamoDB
    await updateReliabilityScore(participantId, reliabilityScore);
    
    // 4. Check if participant has passed the challenge
    const passed = reliabilityScore >= 80;
    if (passed) {
      await revealFlag(participantId);
    }
    
    return {
      participantId,
      score: reliabilityScore,
      passed,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error in assessment for ${participantId}:`, error);
    throw error;
  }
};

/**
 * Calculate reliability score (simplified)
 */
function calculateScore(stackAnalysis) {
  if (stackAnalysis.error) {
    return 0;
  }
  
  const multiRegionScore = stackAnalysis.analysis.multiRegion.score || 0;
  const backupsScore = stackAnalysis.analysis.backups.score || 0;
  
  // Simple average for this simplified version
  return Math.round((multiRegionScore + backupsScore) / 2);
}

/**
 * Update reliability score in DynamoDB
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
    }
  };
  
  return dynamoDB.update(params).promise();
}

/**
 * Reveal flag when participant passes the challenge
 */
async function revealFlag(participantId) {
  const flag = `CTF{${participantId}_reliability_master}`;
  
  const params = {
    TableName: process.env.FLAGS_TABLE,
    Item: {
      challengeId: 'reliability-pillar',
      participantId,
      flag,
      revealed: true,
      timestamp: Date.now()
    }
  };
  
  return dynamoDB.put(params).promise();
}