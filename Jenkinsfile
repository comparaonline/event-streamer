pipeline {
  agent any
  options {
    timeout(time: 0.5, unit: 'HOURS')
  }
  stages {
    stage('Prepare') {
      steps {
        sh 'yarn install'
      }
    }
    stage('Build') {
        steps {
            sh 'yarn build'
        }
    }
    stage('Test') {
        steps {
            sh 'docker-compose -f docker-compose.yml run --rm app'
        }
    }
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
