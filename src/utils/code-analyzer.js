const AWS = require('aws-sdk');
const axios = require('axios');

// Initialize AWS client
const lambda = new AWS.Lambda();

/**
 * Analyzes Lambda code for reliability patterns
 */
async function analyzeCode(functionName) {
  try {
    console.log(`Analyzing code for Lambda function ${functionName}`);
    
    // Get the function code
    const codeResponse = await lambda.getFunction({
      FunctionName: functionName
    }).promise();
    
    // Download code from the signed URL
    let codeContent = null;
    if (codeResponse.Code && codeResponse.Code.Location) {
      const response = await axios.get(codeResponse.Code.Location);
      codeContent = response.data;
    }
    
    if (!codeContent) {
      throw new Error('Could not retrieve function code');
    }
    
    // Convert to string if not already
    const codeString = typeof codeContent === 'string' 
      ? codeContent 
      : JSON.stringify(codeContent);
    
    // Analyze code for reliability patterns
    const patterns = {
      errorHandling: checkErrorHandling(codeString),
      retryLogic: checkRetryLogic(codeString),
      circuitBreaker: checkCircuitBreaker(codeString),
      idempotency: checkIdempotency(codeString),
      asyncProcessing: checkAsyncProcessing(codeString)
    };
    
    // Calculate overall code reliability score
    const score = calculateCodeScore(patterns);
    
    return {
      functionName,
      patterns,
      score
    };
  } catch (error) {
    console.error(`Error analyzing code for ${functionName}:`, error);
    return {
      functionName,
      error: error.message,
      score: 0
    };
  }
}

/**
 * Checks for error handling patterns in code
 */
function checkErrorHandling(codeString) {
  const hasTryCatch = codeString.includes('try') && codeString.includes('catch');
  const hasErrorLogging = codeString.includes('console.error') || 
                          codeString.includes('logger.error');
  const hasErrorResponse = codeString.includes('statusCode: 500') || 
                           codeString.includes('statusCode: 400');
  
  return {
    implemented: hasTryCatch,
    score: (hasTryCatch ? 40 : 0) + 
           (hasErrorLogging ? 30 : 0) + 
           (hasErrorResponse ? 30 : 0)
  };
}

/**
 * Checks for retry logic in code
 */
function checkRetryLogic(codeString) {
  const hasRetry = codeString.includes('retry') || 
                   codeString.includes('attempt') && codeString.includes('maxAttempts');
  const hasBackoff = codeString.includes('backoff') || 
                     codeString.includes('setTimeout') && codeString.includes('Math.pow');
  
  return {
    implemented: hasRetry,
    score: (hasRetry ? 60 : 0) + 
           (hasBackoff ? 40 : 0)
  };
}

/**
 * Checks for circuit breaker pattern in code
 */
function checkCircuitBreaker(codeString) {
  const hasCircuitBreaker = codeString.includes('circuitBreaker') || 
                           (codeString.includes('circuit') && codeString.includes('breaker'));
  
  return {
    implemented: hasCircuitBreaker,
    score: hasCircuitBreaker ? 100 : 0
  };
}

/**
 * Checks for idempotency implementation in code
 */
function checkIdempotency(codeString) {
  const hasIdempotencyToken = codeString.includes('idempotency') || 
                              codeString.includes('requestId');
  const hasConditionalWrite = codeString.includes('ConditionalExpression') || 
                             codeString.includes('attribute_not_exists');
  
  return {
    implemented: hasIdempotencyToken || hasConditionalWrite,
    score: (hasIdempotencyToken ? 50 : 0) + 
           (hasConditionalWrite ? 50 : 0)
  };
}

/**
 * Checks for asynchronous processing patterns in code
 */
function checkAsyncProcessing(codeString) {
  const hasSQS = codeString.includes('SQS') || 
                 codeString.includes('sendMessage');
  const hasSNS = codeString.includes('SNS') || 
                 codeString.includes('publish');
  const hasEventBridge = codeString.includes('EventBridge') || 
                         codeString.includes('putEvents');
  
  return {
    implemented: hasSQS || hasSNS || hasEventBridge,
    score: (hasSQS ? 40 : 0) + 
           (hasSNS ? 30 : 0) + 
           (hasEventBridge ? 30 : 0)
  };
}

/**
 * Calculates overall code reliability score
 */
function calculateCodeScore(patterns) {
  // Define weights for different patterns
  const weights = {
    errorHandling: 0.3,
    retryLogic: 0.25,
    circuitBreaker: 0.15,
    idempotency: 0.15,
    asyncProcessing: 0.15
  };
  
  // Calculate weighted score
  let totalScore = 0;
  for (const [pattern, weight] of Object.entries(weights)) {
    totalScore += (patterns[pattern].score || 0) * weight;
  }
  
  return Math.round(totalScore);
}

module.exports = {
  analyzeCode,
  checkErrorHandling,
  checkRetryLogic,
  checkCircuitBreaker,
  checkIdempotency,
  checkAsyncProcessing
};