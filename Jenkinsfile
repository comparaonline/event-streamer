pipeline {
  // agent { node { label "jenkins-gcp-c2" } }
  agent any
  options {
    timeout(time: 30, unit: 'MINUTES')
  }
  environment {
    NODE_VERSION = "14.17.0"
  }
  stages {
    stage('Prepare') {
      steps {
        nvm(env.NODE_VERSION) {
          sh 'yarn install'
        }
      }
    }
    stage('Build') {
      when {
        anyOf {
          branch "master"
          branch "release"
          branch "support/8.x"
        }
      }
      steps {
        nvm(env.NODE_VERSION) {
          sh 'yarn build'
        }
      }
    }
//    stage('Test') {
//      steps {
//          sh 'docker-compose build --force --no-cache'
//          sh 'docker-compose -f docker-compose.yml run --rm app'
//      }
//    }
    stage('Publish') {
      when {
        allOf {
          anyOf {
            branch 'master'
            branch 'support/8.x'
          }
          expression { return new_version() }
        }
      }
      steps {
        script {
          // The 8.x line is maintenance-only: every patch that reaches npm from here is confirmed by
          // a human first. master keeps publishing unattended, as it always has.
          if (env.BRANCH_NAME == 'support/8.x') {
            timeout(time: 20, unit: 'MINUTES') {
              input message: "Publish ${package_version()} to npm from ${env.BRANCH_NAME}?", ok: 'Publish'
            }
          }
        }
        publish()
      }
    }
  }
}

def published_version() {
  return sh (
      script: 'npm view $(jq -r .name < package.json) version',
      returnStdout: true
  ).trim()
}

def package_version() {
  return sh (
      script: 'jq -r .version < package.json',
      returnStdout: true
  ).trim()
}

def new_version() {
  return (published_version() != package_version())
}

def publish() {
  sh 'npm publish'
  sh "git tag -a 'v${package_version()}' -m 'npm version v${package_version()}'"
  sh "git push origin 'v${package_version()}'"
}
