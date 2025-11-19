pipeline {
  // agent { node { label "jenkins-gcp-c2" } }
  agent any
  options {
    timeout(time: 30, unit: 'MINUTES')
  }
  environment {
    NODE_VERSION = "18"
  }
  stages {
    stage('Prepare') {
      steps {
        nvm(env.NODE_VERSION) {
          sh 'pnpm install'
        }
      }
    }
    stage('Build') {
      when {
        anyOf {
          branch "master"
          branch "release"
        }
      }
      steps {
        nvm(env.NODE_VERSION) {
          sh 'pnpm build'
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
          branch 'master'
          expression { return new_version() }
        }
      }
      steps { publish() }
    }
  }
  post { 
    always { 
      script {
        jenkinsNotification()
      }
    }
  }
}

def published_version() {
  return sh (
      script: 'pnpm view $(jq -r .name < package.json) version',
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
  sh 'pnpm publish'
  sh "git tag -a 'v${package_version()}' -m 'npm version v${package_version()}'"
  sh "git push origin 'v${package_version()}'"
}
