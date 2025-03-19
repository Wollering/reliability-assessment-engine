// comprehensive-test.js
const AWS = require('aws-sdk');
const { deployTestChallenge } = require('./deploy-test-challenge');
const fs = require('fs');
const { execSync } = require('child_process');

const lambda = new AWS.Lambda();
const cloudformation = new AWS.CloudFormation();

async function runComprehensiveTest() {
  const participantId = `test-user-${Date.now().toString().substring(9)}`;
  const tempDir = `./tmp-${participantId}`;
  const results = [];
  
  try {
    // Create directory for modifications
    execSync(`mkdir -p ${tempDir}`);
    
    // 1. Initial deployment - completely unreliable
    console.log('Step 1: Deploy unreliable application');
    await deployTestChallenge(participantId);
    const initialScore = await runAssessment(participantId);
    results.push({ stage: 'initial', score: initialScore });
    
    // 2. Add point-in-time recovery
    console.log('Step 2: Adding point-in-time recovery');
    createModifiedServerlessYml(participantId, tempDir, addPointInTimeRecovery);
    await deployModification(tempDir);
    const pitRecoveryScore = await runAssessment(participantId);
    results.push({ stage: 'point-in-time-recovery', score: pitRecoveryScore });
    
    // 3. Add error handling
    console.log('Step 3: Adding error handling');
    createModifiedHandler(participantId, tempDir, addErrorHandling);
    await deployModification(tempDir);
    const errorHandlingScore = await runAssessment(participantId);
    results.push({ stage: 'error-handling', score: errorHandlingScore });
    
    // 4. Add CloudWatch alarms
    console.log('Step 4: Adding CloudWatch alarms');
    createModifiedServerlessYml(participantId, tempDir, addCloudWatchAlarms);
    await deployModification(tempDir);
    const alarmsScore = await runAssessment(participantId);
    results.push({ stage: 'cloudwatch-alarms', score: alarmsScore });
    
    // 5. Add health check
    console.log('Step 5: Adding health check');
    createModifiedHandler(participantId, tempDir, addHealthCheck);
    createModifiedServerlessYml(participantId, tempDir, addHealthCheckEndpoint);
    await deployModification(tempDir);
    const healthCheckScore = await runAssessment(participantId);
    results.push({ stage: 'health-check', score: healthCheckScore });
    
    // Display all results
    console.log('\n===== Comprehensive Test Results =====');
    for (const result of results) {
      console.log(`${result.stage}: ${result.score}`);
    }
    
    // Check if scores improved appropriately
    const scoreIncreased = results.every((result, index, array) => 
      index === 0 || result.score > array[index - 1].score
    );
    
    if (scoreIncreased) {
      console.log('\n✅ Test passed: Scores improved with each reliability enhancement');
    } else {
      console.log('\n⚠️ Test failed: Scores did not consistently improve with enhancements');
    }
    
    return {
      participantId,
      results
    };
  } catch (error) {
    console.error('Comprehensive test failed:', error);
    throw error;
  } finally {
    // Clean up
    execSync(`rm -rf ${tempDir}`);
    // Optionally clean up the CloudFormation stack
    // await cloudformation.deleteStack({ StackName: `unreliable-test-app-${participantId}` }).promise();
  }
}

// Helper functions for modifications
function addPointInTimeRecovery(serverlessYml) {
  return serverlessYml.replace(
    'AttributeDefinitions:',
    'PointInTimeRecoverySpecification:\n        PointInTimeRecoveryEnabled: true\n      AttributeDefinitions:'
  );
}

function addErrorHandling(handlerJs) {
  return handlerJs.replace(
    "module.exports.api = async (event) => {",
    `module.exports.api = async (event) => {
  try {`
  ).replace(
    "return {",
    `  } catch (error) {
    console.error('API error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
  
  return {`
  );
}

// Add more modification functions here

// Helper to run assessment
async function runAssessment(participantId) {
  const response = await lambda.invoke({
    FunctionName: 'reliability-assessment-engine-dev-assessmentEngine',
    Payload: JSON.stringify({ participantId })
  }).promise();
  
  const result = JSON.parse(response.Payload);
  return result.score;
}

// Helper to create modified files
function createModifiedServerlessYml(participantId, tempDir, modifyFn) {
  let serverlessYml = fs.readFileSync('./serverless.yml', 'utf8');
  serverlessYml = serverlessYml.replace(
    'service: unreliable-test-app', 
    `service: unreliable-test-app-${participantId}`
  );
  serverlessYml = serverlessYml.replace(
    'TableName: unreliable-test-app-data', 
    `TableName: unreliable-test-app-data-${participantId}`
  );
  
  // Apply modification
  serverlessYml = modifyFn(serverlessYml);
  
  fs.writeFileSync(`${tempDir}/serverless.yml`, serverlessYml);
}

function createModifiedHandler(participantId, tempDir, modifyFn) {
  let handlerJs = fs.readFileSync('./handler.js', 'utf8');
  handlerJs = handlerJs.replace(
    "const tableName = 'unreliable-test-app-data'", 
    `const tableName = 'unreliable-test-app-data-${participantId}'`
  );
  
  // Apply modification
  handlerJs = modifyFn(handlerJs);
  
  fs.writeFileSync(`${tempDir}/handler.js`, handlerJs);
}

async function deployModification(tempDir) {
  execSync(`cd ${tempDir} && npx serverless deploy`, { stdio: 'inherit' });
  // Wait for deployment to complete
  await new Promise(resolve => setTimeout(resolve, 10000));
}

// Run the test
if (require.main === module) {
  runComprehensiveTest()
    .then(result => console.log('Comprehensive test completed'))
    .catch(err => {
      console.error('Comprehensive test failed:', err);
      process.exit(1);
    });
}