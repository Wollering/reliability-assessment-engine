#!/bin/bash
# =========================================================================
# ctf-deploy.sh - CloudFormation Deployment Script for CTF Assessment Engine
# =========================================================================
#
# DESCRIPTION:
#   This script simplifies the deployment of AWS CloudFormation templates
#   for the CTF Assessment Engine. It sets up necessary environment variables,
#   allows customization of parameters, and handles the CloudFormation stack
#   creation process.
#
# PREREQUISITES:
#   - AWS CLI installed and configured with appropriate permissions
#   - jq installed (for JSON parsing) if using advanced features
#   - CloudFormation template file (ctf-infrastructure.yaml by default)
#
# USAGE:
#   1. Make the script executable:
#      chmod +x ctf-deploy.sh
#
#   2. Run the script:
#      ./ctf-deploy.sh
#
#   3. Follow the prompts to review and modify configuration if needed
#
# ENVIRONMENT VARIABLES (can be preset before running):
#   STACK_NAME       - Name of the CloudFormation stack (default: ctf-assessment-engine)
#   AWS_REGION       - AWS region for deployment (default: us-east-1)
#   EXTERNAL_ID      - External ID for cross-account access (default: ctf-assessment-engine)
#   RESOURCE_PREFIX  - Prefix for all resource names (default: ctf)
#   TEMPLATE_FILE    - Path to CloudFormation template (default: ctf-infrastructure.yaml)
#
# EXAMPLES:
#   # Run with default values:
#   ./ctf-deploy.sh
#
#   # Run with custom values:
#   STACK_NAME="my-ctf-stack" AWS_REGION="us-west-2" ./ctf-deploy.sh
#
# AUTHOR:
#   Created on: May 17, 2025
#
# =========================================================================

# Set default environment variables
export STACK_NAME="${STACK_NAME:-ctf-assessment-engine}"
export AWS_REGION="${AWS_REGION:-us-east-1}"
export EXTERNAL_ID="${EXTERNAL_ID:-ctf-assessment-engine}"
export RESOURCE_PREFIX="${RESOURCE_PREFIX:-ctf}"
export TEMPLATE_FILE="${TEMPLATE_FILE:-ctf-infrastructure.yaml}"

# Print a formatted header
print_header() {
    echo "====================================================================="
    echo "  CloudFormation Deployment for CTF Assessment Engine"
    echo "====================================================================="
}

# Print a formatted section
print_section() {
    echo ""
    echo "→ $1"
    echo "-------------------------------------------------------------------"
}

# Get AWS account ID
get_account_id() {
    print_section "Retrieving AWS Account Information"
    
    export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    if [ $? -ne 0 ]; then
        echo "❌ Error retrieving AWS account ID. Please check your AWS credentials."
        echo "   Run 'aws configure' to set up your AWS credentials."
        exit 1
    fi
    echo "✅ AWS Account ID: $ACCOUNT_ID"
}

# Display current configuration
show_configuration() {
    print_section "Current Configuration"
    
    echo "Stack Name:       $STACK_NAME"
    echo "AWS Region:       $AWS_REGION"
    echo "AWS Account ID:   $ACCOUNT_ID"
    echo "External ID:      $EXTERNAL_ID"
    echo "Resource Prefix:  $RESOURCE_PREFIX"
    echo "Template File:    $TEMPLATE_FILE"
}

# Allow modification of settings
modify_settings() {
    print_section "Configuration Review"
    
    read -p "Would you like to proceed with these settings? (y/n) " PROCEED
    
    if [[ $PROCEED != "y" && $PROCEED != "Y" ]]; then
        print_section "Customize Configuration"
        
        read -p "Enter Stack Name [$STACK_NAME]: " NEW_STACK_NAME
        read -p "Enter AWS Region [$AWS_REGION]: " NEW_AWS_REGION
        read -p "Enter External ID [$EXTERNAL_ID]: " NEW_EXTERNAL_ID
        read -p "Enter Resource Prefix [$RESOURCE_PREFIX]: " NEW_RESOURCE_PREFIX
        read -p "Enter Template File Path [$TEMPLATE_FILE]: " NEW_TEMPLATE_FILE
        
        # Update variables if new values were provided
        export STACK_NAME=${NEW_STACK_NAME:-$STACK_NAME}
        export AWS_REGION=${NEW_AWS_REGION:-$AWS_REGION}
        export EXTERNAL_ID=${NEW_EXTERNAL_ID:-$EXTERNAL_ID}
        export RESOURCE_PREFIX=${NEW_RESOURCE_PREFIX:-$RESOURCE_PREFIX}
        export TEMPLATE_FILE=${NEW_TEMPLATE_FILE:-$TEMPLATE_FILE}
        
        print_section "Updated Configuration"
        echo "Stack Name:       $STACK_NAME"
        echo "AWS Region:       $AWS_REGION"
        echo "External ID:      $EXTERNAL_ID"
        echo "Resource Prefix:  $RESOURCE_PREFIX"
        echo "Template File:    $TEMPLATE_FILE"
    fi
}

# Verify prerequisites
verify_prerequisites() {
    print_section "Verifying Prerequisites"
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        echo "❌ AWS CLI not found. Please install it first:"
        echo "   https://aws.amazon.com/cli/"
        exit 1
    fi
    echo "✅ AWS CLI is installed."
    
    # Verify template file exists
    if [ ! -f "$TEMPLATE_FILE" ]; then
        echo "❌ Template file not found: $TEMPLATE_FILE"
        echo "   Please ensure the CloudFormation template exists at this location."
        exit 1
    fi
    echo "✅ CloudFormation template found: $TEMPLATE_FILE"
}

# Deploy the CloudFormation stack
deploy_stack() {
    print_section "Deploying CloudFormation Stack"
    
    echo "Creating CloudFormation stack '$STACK_NAME'..."
    echo "This process may take several minutes."
    
    aws cloudformation create-stack \
        --stack-name $STACK_NAME \
        --template-body file://$TEMPLATE_FILE \
        --parameters \
            ParameterKey=AwsRegion,ParameterValue=$AWS_REGION \
            ParameterKey=ExternalId,ParameterValue=$EXTERNAL_ID \
            ParameterKey=ResourcePrefix,ParameterValue=$RESOURCE_PREFIX \
        --capabilities CAPABILITY_IAM \
        --region $AWS_REGION
    
    if [ $? -eq 0 ]; then
        echo "✅ Stack creation initiated successfully!"
        echo ""
        echo "You can monitor the stack creation progress in the AWS CloudFormation Console"
        echo "or by running:"
        echo "aws cloudformation describe-stacks --stack-name $STACK_NAME --region $AWS_REGION"
        
        # Wait for stack creation to complete (optional)
        read -p "Would you like to wait for stack creation to complete? (y/n) " WAIT_RESPONSE
        if [[ $WAIT_RESPONSE == "y" || $WAIT_RESPONSE == "Y" ]]; then
            echo "Waiting for stack creation to complete (this may take several minutes)..."
            aws cloudformation wait stack-create-complete \
                --stack-name $STACK_NAME \
                --region $AWS_REGION
            
            if [ $? -eq 0 ]; then
                echo "✅ Stack creation completed successfully!"
                
                # Display stack outputs
                echo ""
                echo "Stack outputs:"
                aws cloudformation describe-stacks \
                    --stack-name $STACK_NAME \
                    --query "Stacks[0].Outputs" \
                    --output table \
                    --region $AWS_REGION
            else
                echo "❌ Stack creation failed or timed out."
                echo "Please check the AWS CloudFormation Console for more details."
            fi
        fi
    else
        echo "❌ Stack creation failed. Please check the error and try again."
    fi
}

# Main execution flow
main() {
    print_header
    get_account_id
    show_configuration
    modify_settings
    verify_prerequisites
    deploy_stack
    
    # Print completion message
    print_section "Deployment Process Complete"
    echo "Thank you for using the CTF Assessment Engine deployment script."
    echo "If you have any issues, please check the AWS CloudFormation Console"
    echo "or contact your administrator."
}

# Run the main function
main

# Exit successfully
exit 0
