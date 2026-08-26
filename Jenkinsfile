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
          // The 8.x line is maintenance-only: every release that reaches npm from here is confirmed
          // by a human first. master keeps publishing unattended, as it always has.
          def approved = true
          if (env.BRANCH_NAME == 'support/8.x') {
            try {
              // Shorter than the build-level timeout above, which this wait is subtracted from --
              // otherwise the approval window silently shrinks by however long Prepare and Build took.
              timeout(time: 10, unit: 'MINUTES') {
                input message: "Publish ${package_version()} to npm from ${env.BRANCH_NAME}?", ok: 'Publish'
              }
            } catch (err) {
              // Declining is a normal outcome on a gate that exists to be declined, so it must not
              // be indistinguishable from a build that broke.
              approved = false
              currentBuild.result = 'NOT_BUILT'
              echo "Publish of ${package_version()} was declined or timed out. Nothing was published."
            }
          }
          if (approved) {
            publish()
          }
        }
      }
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

def package_name() {
  return sh (
      script: 'jq -r .name < package.json',
      returnStdout: true
  ).trim()
}

def package_version() {
  return sh (
      script: 'jq -r .version < package.json',
      returnStdout: true
  ).trim()
}

// Whether this exact version is still unpublished. The previous check compared against the 'latest'
// dist-tag, which stops answering the question as soon as a branch publishes under a different tag:
// latest would stay on another version forever, so every build would retry a publish that the
// registry rejects with EPUBLISHCONFLICT.
def new_version() {
  return sh (
      script: "npm view ${package_name()}@${package_version()} version > /dev/null 2>&1",
      returnStatus: true
  ) != 0
}

def publish() {
  // The maintenance line must not take 'latest' over: a registry moves that tag to whatever was
  // published last, with no semver check, so an unqualified publish here would point every consumer
  // installing without a range back at 8.x from whatever master last released. Version ranges are
  // resolved by version, not by tag, so '^8.x' consumers still pick this up.
  // '8x', not '8.x': npm rejects any tag name that parses as a valid semver range, and '8.x' is one.
  def tag = env.BRANCH_NAME == 'support/8.x' ? '8x' : 'latest'
  sh "npm publish --tag ${tag}"
  sh "git tag -a 'v${package_version()}' -m 'npm version v${package_version()}'"
  sh "git push origin 'v${package_version()}'"
}
