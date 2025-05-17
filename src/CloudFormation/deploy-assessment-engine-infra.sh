AWSTemplateFormatVersion: '2010-09-09'
Description: 'CTF Assessment Engine Infrastructure'

Parameters:
  ExternalId:
    Type: String
    Default: 'ctf-assessment-engine'
    Description: External ID for cross-account access

Resources:
  ChallengeBucket:
    Type: 'AWS::S3::Bucket'
    Properties:
      BucketName: !Join 
        - '-'
        - - 'ctf-reliability-challenges'
          - !Select [0, !Split ['.', !Ref 'AWS::AccountId']]
          - !Select [0, !Split ['.', !Ref 'AWS::TimeStamp']]
      VersioningConfiguration:
        Status: Enabled
      Tags:
        - Key: Purpose
          Value: CTF Challenges

  DeploymentBucket:
    Type: 'AWS::S3::Bucket'
    Properties:
      BucketName: !Join 
        - '-'
        - - 'ctf-deployment'
          - !Select [0, !Split ['.', !Ref 'AWS::AccountId']]
          - !Select [0, !Split ['.', !Ref 'AWS::TimeStamp']]
      Tags:
        - Key: Purpose
          Value: Lambda Deployment Packages

Outputs:
  ChallengeBucketName:
    Description: 'Name of the challenge bucket'
    Value: !Ref ChallengeBucket
  
  DeploymentBucketName:
    Description: 'Name of the deployment bucket'
    Value: !Ref DeploymentBucket
  
  AccountId:
    Description: 'AWS Account ID'
    Value: !Ref 'AWS::AccountId'
