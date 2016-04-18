var fs = require('fs');
angular.module('ngFormioHelper', ['formio', 'ngFormioGrid', 'ui.router'])
  .filter('capitalize', [function () {
    return _.capitalize;
  }])
  .filter('truncate', [function () {
    return function (input, opts) {
      if (_.isNumber(opts)) {
        opts = {length: opts};
      }
      return _.truncate(input, opts);
    };
  }])
  .directive("fileread", [
    function () {
      return {
        scope: {
          fileread: "="
        },
        link: function (scope, element) {
          element.bind("change", function (changeEvent) {
            var reader = new FileReader();
            reader.onloadend = function (loadEvent) {
              scope.$apply(function () {
                scope.fileread = jQuery(loadEvent.target.result);
              });
            };
            reader.readAsText(changeEvent.target.files[0]);
          });
        }
      };
    }
  ])
  .provider('FormioResource', [
    '$stateProvider',
    function ($stateProvider) {
      var resources = {};
      return {
        register: function (name, url, options) {
          options = options || {};
          resources[name] = options.title || name;
          var parent = (options && options.parent) ? options.parent : null;
          var queryId = name + 'Id';
          options.base = options.base || '';
          var baseName = options.base + name;
          var query = function (submission) {
            var query = {};
            query[queryId] = submission._id;
            return query;
          };

          // Allow them to alter the options per state.
          var baseAlter = function (options) {
            return options;
          };
          options.alter = angular.extend({
            index: baseAlter,
            create: baseAlter,
            abstract: baseAlter,
            view: baseAlter,
            edit: baseAlter,
            delete: baseAlter
          }, options.alter);

          var templates = (options && options.templates) ? options.templates : {};
          var controllers = (options && options.controllers) ? options.controllers : {};
          var queryParams = options.query ? options.query : '';
          $stateProvider
            .state(baseName + 'Index', options.alter.index({
              url: '/' + name + queryParams,
              parent: parent ? parent : null,
              params: options.params && options.params.index,
              templateUrl: templates.index ? templates.index : 'formio-helper/resource/index.html',
              controller: [
                '$scope',
                '$state',
                '$controller',
                function ($scope,
                          $state,
                          $controller) {
                  $scope.currentResource = {
                    name: name,
                    queryId: queryId,
                    formUrl: url,
                    columns: [],
                    gridOptions: {}
                  };
                  $scope.$on('rowView', function (event, submission) {
                    $state.go(name + '.view', query(submission));
                  });
                  $scope.$on('submissionView', function (event, submission) {
                    $state.go(name + '.view', query(submission));
                  });

                  $scope.$on('submissionEdit', function (event, submission) {
                    $state.go(name + '.edit', query(submission));
                  });

                  $scope.$on('submissionDelete', function (event, submission) {
                    $state.go(name + '.delete', query(submission));
                  });
                  if (controllers.index) {
                    $controller(controllers.index, {$scope: $scope});
                  }
                }
              ]
            }))
            .state(baseName + 'Create', options.alter.create({
              url: '/create/' + name + queryParams,
              parent: parent ? parent : null,
              params: options.params && options.params.create,
              templateUrl: templates.create ? templates.create : 'formio-helper/resource/create.html',
              controller: [
                '$scope',
                '$state',
                '$controller',
                function ($scope,
                          $state,
                          $controller) {
                  $scope.currentResource = {
                    name: name,
                    queryId: queryId,
                    formUrl: url
                  };
                  $scope.submission = options.defaultValue ? options.defaultValue : {data: {}};
                  $scope.pageTitle = 'New ' + _.capitalize(name);
                  var handle = false;
                  if (controllers.create) {
                    var ctrl = $controller(controllers.create, {$scope: $scope});
                    handle = (ctrl.handle || false);
                  }
                  if (parent) {
                    if (!$scope.hideComponents) {
                      $scope.hideComponents = [];
                    }
                    $scope.hideComponents.push(parent);

                    // Auto populate the parent entity with the new data.
                    $scope[parent].loadSubmissionPromise.then(function (entity) {
                      $scope.submission.data[parent] = entity;
                    });
                  }
                  if (!handle) {
                    $scope.$on('formSubmission', function (event, submission) {
                      $scope.currentResource.resource = submission;
                      $state.go(name + '.view', query(submission));
                    });
                  }
                }
              ]
            }))
            .state(baseName, options.alter.abstract({
              abstract: true,
              url: '/' + name + '/:' + queryId,
              parent: parent ? parent : null,
              templateUrl: templates.abstract ? templates.abstract : 'formio-helper/resource/resource.html',
              controller: [
                '$scope',
                '$stateParams',
                'Formio',
                '$controller',
                '$http',
                function ($scope,
                          $stateParams,
                          Formio,
                          $controller,
                          $http) {
                  var submissionUrl = url;
                  var endpoint = options.endpoint;
                  if (endpoint) {
                    endpoint += '/' + $stateParams[queryId];
                  }
                  else {
                    submissionUrl += '/submission/' + $stateParams[queryId];
                  }

                  $scope.currentResource = $scope[name] = {
                    name: name,
                    queryId: queryId,
                    formUrl: url,
                    submissionUrl: submissionUrl,
                    formio: (new Formio(submissionUrl)),
                    resource: {},
                    form: {},
                    href: '/#/' + name + '/' + $stateParams[queryId] + '/',
                    parent: parent ? $scope[parent] : {href: '/#/', name: 'home'}
                  };

                  $scope.currentResource.loadFormPromise = $scope.currentResource.formio.loadForm().then(function (form) {
                    $scope.currentResource.form = $scope[name].form = form;
                    return form;
                  });

                  // If they provide their own endpoint for data.
                  if (options.endpoint) {
                    $scope.currentResource.loadSubmissionPromise = $http.get(endpoint, {
                      headers: {
                        'x-jwt-token': Formio.getToken()
                      }
                    }).then(function (result) {
                      $scope.currentResource.resource = result.data;
                      return result.data;
                    });
                  }
                  else {
                    $scope.currentResource.loadSubmissionPromise = $scope.currentResource.formio.loadSubmission().then(function (submission) {
                      $scope.currentResource.resource = $scope[name].submission = submission;
                      return submission;
                    });
                  }

                  if (controllers.abstract) {
                    $controller(controllers.abstract, {$scope: $scope});
                  }
                }
              ]
            }))
            .state(baseName + '.view', options.alter.view({
              url: '/',
              parent: baseName,
              params: options.params && options.params.view,
              templateUrl: templates.view ? templates.view : 'formio-helper/resource/view.html',
              controller: [
                '$scope',
                '$controller',
                function ($scope,
                          $controller) {
                  if (controllers.view) {
                    $controller(controllers.view, {$scope: $scope});
                  }
                }
              ]
            }))
            .state(baseName + '.edit', options.alter.edit({
              url: '/edit',
              parent: baseName,
              params: options.params && options.params.edit,
              templateUrl: templates.edit ? templates.edit : 'formio-helper/resource/edit.html',
              controller: [
                '$scope',
                '$state',
                '$controller',
                function ($scope,
                          $state,
                          $controller) {
                  var handle = false;
                  if (controllers.edit) {
                    var ctrl = $controller(controllers.edit, {$scope: $scope});
                    handle = (ctrl.handle || false);
                  }
                  if (!handle) {
                    $scope.$on('formSubmission', function (event, submission) {
                      $scope.currentResource.resource = submission;
                      $state.go(name + '.view', query(submission));
                    });
                  }
                }
              ]
            }))
            .state(baseName + '.delete', options.alter.delete({
              url: '/delete',
              parent: baseName,
              params: options.params && options.params.delete,
              templateUrl: templates.delete ? templates.delete : 'formio-helper/resource/delete.html',
              controller: [
                '$scope',
                '$state',
                '$controller',
                function ($scope,
                          $state,
                          $controller) {
                  var handle = false;
                  $scope.resourceName = name;
                  if (controllers.delete) {
                    var ctrl = $controller(controllers.delete, {$scope: $scope});
                    handle = (ctrl.handle || false);
                  }
                  if (!handle) {
                    $scope.$on('delete', function () {
                      if (parent && parent !== 'home') {
                        $state.go(parent + '.view');
                      }
                      else {
                        $state.go('home', null, {reload: true});
                      }
                    });
                    $scope.$on('cancel', function () {
                      $state.go(name + 'Index');
                    });
                  }
                }
              ]
            }));
        },
        $get: function () {
          return resources;
        }
      };
    }
  ])
  .directive('formioForms', function () {
    return {
      restrict: 'E',
      replace: true,
      scope: {
        src: '=',
        base: '=',
        tag: '=?'
      },
      templateUrl: 'formio-helper/form/list.html',
      controller: ['$scope', 'Formio', function ($scope, Formio) {
        $scope.forms = [];
        var params = {
          type: 'form',
          limit: 9999999
        };
        var loadForms = function () {
          if (!$scope.src) {
            return;
          }
          if ($scope.tag) {
            params.tags = $scope.tag;
          }
          (new Formio($scope.src)).loadForms({params: params}).then(function (forms) {
            $scope.forms = forms;
          });
        };

        $scope.$watch('src', loadForms);
      }]
    };
  })
  .provider('FormioForms', [
    '$stateProvider',
    function ($stateProvider) {
      var resources = {};
      return {
        register: function (name, url, options) {
          options = options || {};
          var templates = options.templates ? options.templates : {};
          var controllers = options.controllers ? options.controllers : {};
          var fields = (typeof options.field === 'string') ? [options.field] : options.field;
          var basePath = options.base ? options.base : '';
          if (!basePath) {
            basePath = name ? name + '.' : '';
          }

          $stateProvider
            .state(basePath + 'formIndex', {
              url: '/forms',
              params: options.params && options.params.index,
              templateUrl: templates.index ? templates.index : 'formio-helper/form/index.html',
              controller: ['$scope', 'Formio', '$controller', function ($scope, Formio, $controller) {
                $scope.formBase = basePath;
                $scope.formsSrc = url + '/form';
                $scope.formsTag = $scope.formsTag || options.tag;
                if (controllers.index) {
                  $controller(controllers.index, {$scope: $scope});
                }
              }]
            })
            .state(basePath + 'form', {
              url: '/form/:formId',
              abstract: true,
              templateUrl: templates.form ? templates.form : 'formio-helper/form/form.html',
              controller: [
                '$scope',
                '$stateParams',
                'Formio',
                '$controller',
                function ($scope,
                          $stateParams,
                          Formio,
                          $controller) {
                  var formUrl = url + '/form/' + $stateParams.formId;
                  $scope.formBase = basePath;
                  $scope.currentForm = {
                    name: name,
                    url: formUrl,
                    form: {}
                  };

                  $scope.currentForm.formio = (new Formio(formUrl));
                  $scope.currentForm.promise = $scope.currentForm.formio.loadForm().then(function (form) {
                    $scope.currentForm.form = form;
                    return form;
                  });

                  if (controllers.form) {
                    $controller(controllers.form, {$scope: $scope});
                  }
                }
              ]
            })
            .state(basePath + 'form.view', {
              url: '/',
              params: options.params && options.params.view,
              templateUrl: templates.view ? templates.view : 'formio-helper/form/view.html',
              controller: [
                '$scope',
                '$state',
                'FormioUtils',
                '$controller',
                function ($scope,
                          $state,
                          FormioUtils,
                          $controller) {
                  $scope.submission = {data: {}};
                  var handle = false;
                  if (fields && fields.length) {
                    $scope.hideComponents = fields;
                    $scope.currentForm.promise.then(function () {
                      fields.forEach(function (field) {
                        $scope[field].loadSubmissionPromise.then(function (resource) {
                          $scope.submission.data[field] = resource;
                        });
                      });
                    });
                  }
                  if (controllers.view) {
                    var ctrl = $controller(controllers.view, {$scope: $scope});
                    handle = (ctrl.handle || false);
                  }
                  if (!handle) {
                    $scope.$on('formSubmission', function () {
                      $state.go(basePath + 'form.submissions');
                    });
                  }
                }
              ]
            })
            .state(basePath + 'form.submissions', {
              url: '/submissions',
              params: options.params && options.params.submissions,
              templateUrl: templates.submissions ? templates.submissions : 'formio-helper/submission/index.html',
              controller: [
                '$scope',
                '$state',
                '$stateParams',
                'FormioUtils',
                '$controller',
                function ($scope,
                          $state,
                          $stateParams,
                          FormioUtils,
                          $controller) {
                  $scope.submissionQuery = {};
                  $scope.submissionColumns = [];
                  if (fields && fields.length) {
                    fields.forEach(function (field) {
                      $scope.submissionQuery['data.' + field + '._id'] = $stateParams[field + 'Id'];
                    });
                  }

                  // Go to the submission when they click on the row.
                  $scope.$on('rowView', function (event, entity) {
                    $state.go(basePath + 'form.submission.view', {
                      formId: entity.form,
                      submissionId: entity._id
                    });
                  });

                  if (controllers.submissions) {
                    $controller(controllers.submissions, {$scope: $scope});
                  }

                  $scope.currentForm.promise.then(function (form) {
                    localStorage.setItem(form.name, '');
                    if (
                      !$scope.submissionColumns.length &&
                      !Object.keys($scope.submissionColumns).length === 0
                    ) {
                      FormioUtils.eachComponent(form.components, function (component) {
                        if (!component.key || !component.input || !component.tableView) {
                          return;
                        }
                        if (fields && fields.length && (fields.indexOf(component.key) !== -1)) {
                          return;
                        }
                        $scope.submissionColumns.push(component.key);
                      });

                      // Ensure we reload the data grid.
                      $scope.$broadcast('reloadGrid');
                    }
                  });
                }
              ]
            })
            .state(basePath + 'form.submission', {
              abstract: true,
              url: '/submission/:submissionId',
              params: options.params && options.params.submission,
              templateUrl: templates.submission ? templates.submission : 'formio-helper/submission/submission.html',
              controller: [
                '$scope',
                '$stateParams',
                'Formio',
                '$controller',
                function ($scope,
                          $stateParams,
                          Formio,
                          $controller) {
                  $scope.currentSubmission = {
                    url: $scope.currentForm.url + '/submission/' + $stateParams.submissionId,
                    submission: {
                      data: {}
                    }
                  };

                  // Store the formio object.
                  $scope.currentSubmission.formio = (new Formio($scope.currentSubmission.url));

                  // Load the current submission.
                  $scope.currentSubmission.promise = $scope.currentSubmission.formio.loadSubmission().then(function (submission) {
                    $scope.currentSubmission.submission = submission;
                    return submission;
                  });

                  // Execute the controller.
                  if (controllers.submission) {
                    $controller(controllers.submission, {$scope: $scope});
                  }
                }
              ]
            })
            .state(basePath + 'form.submission.view', {
              url: '/',
              params: options.params && options.params.submissionView,
              templateUrl: templates.submissionView ? templates.submissionView : 'formio-helper/submission/view.html',
              controller: [
                '$scope',
                '$controller',
                function ($scope,
                          $controller) {
                  if (controllers.submissionView) {
                    $controller(controllers.submissionView, {$scope: $scope});
                  }
                }
              ]
            })
            .state(basePath + 'form.submission.edit', {
              url: '/edit',
              params: options.params && options.params.submissionEdit,
              templateUrl: templates.submissionEdit ? templates.submissionEdit : 'formio-helper/submission/edit.html',
              controller: [
                '$scope',
                '$state',
                '$controller',
                function ($scope,
                          $state,
                          $controller) {
                  var handle = false;
                  if (controllers.submissionEdit) {
                    var ctrl = $controller(controllers.submissionEdit, {$scope: $scope});
                    handle = (ctrl.handle || false);
                  }
                  if (!handle) {
                    $scope.$on('formSubmission', function (event, submission) {
                      $scope.currentSubmission.submission = submission;
                      $state.go(basePath + 'form.submission.view');
                    });
                  }
                }
              ]
            })
            .state(basePath + 'form.submission.delete', {
              url: '/delete',
              params: options.params && options.params.submissionDelete,
              templateUrl: templates.submissionDelete ? templates.submissionDelete : 'formio-helper/submission/delete.html',
              controller: [
                '$scope',
                '$state',
                '$controller',
                function ($scope,
                          $state,
                          $controller) {
                  var handle = false;
                  if (controllers.submissionDelete) {
                    var ctrl = $controller(controllers.submissionDelete, {$scope: $scope});
                    handle = (ctrl.handle || false);
                  }
                  if (!handle) {
                    $scope.$on('delete', function () {
                      $state.go(basePath + 'form.submissions');
                    });

                    $scope.$on('cancel', function () {
                      $state.go(basePath + 'form.submission.view');
                    });
                  }
                }
              ]
            })
        },
        $get: function () {
          return resources;
        }
      };
    }
  ])
  .provider('FormioAuth', [
    '$stateProvider',
    function ($stateProvider) {
      var init = false;
      var anonState = 'auth.login';
      var anonRole = false;
      var appUrl = '';
      var authState = 'home';
      var forceAuth = false;
      var registered = false;
      // These are needed to check permissions against specific forms.
      var formAccess = {};
      return {
        setForceAuth: function (force) {
          forceAuth = force;
        },
        setStates: function (anon, auth) {
          anonState = anon;
          authState = auth;
        },
        setAnonRole: function(role) {
          anonRole = role;
        },
        setAppUrl: function(url) {
          appUrl = url;
        },
        register: function (name, resource, path) {
          if (!registered) {
            registered = true;
            $stateProvider.state('auth', {
              abstract: true,
              url: '/auth',
              templateUrl: 'views/user/auth.html'
            });
          }

          if (!path) {
            path = name;
          }
          $stateProvider
            .state('auth.' + name, {
              url: '/' + path,
              parent: 'auth',
              templateUrl: 'views/user/' + name.toLowerCase() + '.html',
              controller: ['$scope', '$state', '$rootScope', function ($scope, $state, $rootScope) {
                $scope.$on('formSubmission', function (err, submission) {
                  if (!submission) {
                    return;
                  }
                  $rootScope.setUser(submission, resource);
                  $state.go(authState);
                });
              }]
            })
        },
        $get: [
          'Formio',
          'FormioAlerts',
          '$rootScope',
          '$state',
          function (Formio,
                    FormioAlerts,
                    $rootScope,
                    $state) {
            return {
              init: function () {
                init = true;
                // Format the roles and access for easy usage.
                (new Formio(appUrl + '/form')).loadForms({params:{limit: 9999999}}).then(function (forms) {
                  forms.forEach(function(form) {
                    formAccess[form.name] = {};
                    form.submissionAccess.forEach(function(access) {
                      formAccess[form.name][access.type] = access.roles;
                    });
                  });
                });
                $rootScope.user = {};
                $rootScope.isRole = function (role) {
                  return $rootScope.role === role.toLowerCase();
                };
                $rootScope.setUser = function (user, role) {
                  if (user) {
                    $rootScope.user = user;
                    localStorage.setItem('formioAppUser', angular.toJson(user));
                  }
                  else {
                    $rootScope.user = null;
                    localStorage.removeItem('formioAppUser');
                    localStorage.removeItem('formioUser');
                  }

                  if (!role) {
                    $rootScope.role = null;
                    localStorage.removeItem('formioAppRole');
                  }
                  else {
                    $rootScope.role = role.toLowerCase();
                    localStorage.setItem('formioAppRole', role);
                  }

                  $rootScope.authenticated = !!Formio.getToken();
                  $rootScope.$emit('user', {
                    user: $rootScope.user,
                    role: $rootScope.role
                  });
                };

                $rootScope.hasAccess = function(form, permissions) {
                  // Bypass if using an alternative Auth system.
                  if (!init) {
                    return true;
                  }

                  // Allow single permission or array of permissions.
                  if (!Array.isArray(permissions)) {
                    permissions = [permissions];
                  }

                  // Check that the formAccess has been initialized.
                  if (!formAccess[form]) {
                    return false;
                  }
                  var hasAccess = false;
                  permissions.forEach(function(permission) {
                    // Check for anonymous users. Must set anonRole.
                    if (!$rootScope.user) {
                      if (formAccess[form][permission].indexOf(anonRole) !== -1) {
                        hasAccess = true;
                      }
                    }
                    else {
                      // Check the user's roles for access.
                      $rootScope.user.roles.forEach(function(role) {
                        if (formAccess[form][permission].indexOf(role) !== -1) {
                          hasAccess = true;
                        }
                      });
                    }
                  });
                  return hasAccess;
                };

                // Set the current user object and role.
                var user = localStorage.getItem('formioAppUser');
                $rootScope.setUser(
                  user ? angular.fromJson(user) : null,
                  localStorage.getItem('formioAppRole')
                );

                if (!$rootScope.user) {
                  Formio.currentUser().then(function (user) {
                    $rootScope.setUser(user, localStorage.getItem('formioRole'));
                  });
                }

                var logoutError = function () {
                  $rootScope.setUser(null, null);
                  localStorage.removeItem('formioToken');
                  $state.go(anonState, {}, {reload: true});
                  FormioAlerts.addAlert({
                    type: 'danger',
                    message: 'Your session has expired. Please log in again.'
                  });
                };

                $rootScope.$on('formio.sessionExpired', logoutError);

                // Trigger when a logout occurs.
                $rootScope.logout = function () {
                  $rootScope.setUser(null, null);
                  localStorage.removeItem('formioToken');
                  Formio.logout().then(function () {
                    $state.go(anonState, {}, {reload: true});
                  }).catch(logoutError);
                };

                // Ensure they are logged.
                $rootScope.$on('$stateChangeStart', function (event, toState) {
                  $rootScope.authenticated = !!Formio.getToken();
                  if (forceAuth) {
                    if (toState.name.substr(0, 4) === 'auth') {
                      return;
                    }
                    if (!$rootScope.authenticated) {
                      event.preventDefault();
                      $state.go(anonState, {}, {reload: true});
                    }
                  }
                });

                // Set the alerts
                $rootScope.$on('$stateChangeSuccess', function () {
                  $rootScope.alerts = FormioAlerts.getAlerts();
                });
              }
            };
          }
        ]
      };
    }
  ])
  .factory('FormioAlerts', [
    '$rootScope',
    function ($rootScope) {
      var alerts = [];
      return {
        addAlert: function (alert) {
          $rootScope.alerts.push(alert);
          if (alert.element) {
            angular.element('#form-group-' + alert.element).addClass('has-error');
          }
          else {
            alerts.push(alert);
          }
        },
        getAlerts: function () {
          var tempAlerts = angular.copy(alerts);
          alerts.length = 0;
          alerts = [];
          return tempAlerts;
        },
        onError: function showError(error) {
          if (error.message) {
            this.addAlert({
              type: 'danger',
              message: error.message,
              element: error.path
            });
          }
          else {
            var errors = error.hasOwnProperty('errors') ? error.errors : error.data.errors;
            angular.forEach(errors, showError.bind(this));
          }
        }
      };
    }
  ])
  .run([
    '$templateCache',
    '$rootScope',
    '$state',
    function ($templateCache,
              $rootScope,
              $state) {
      // Determine the active state.
      $rootScope.isActive = function (state) {
        return $state.current.name.indexOf(state) !== -1;
      };

      /**** RESOURCE TEMPLATES *******/
      $templateCache.put('formio-helper/resource/resource.html',
        fs.readFileSync(__dirname + '/templates/resource/resource.html', 'utf8')
      );

      $templateCache.put('formio-helper/resource/create.html',
        fs.readFileSync(__dirname + '/templates/resource/create.html', 'utf8')
      );

      $templateCache.put('formio-helper/resource/delete.html',
        fs.readFileSync(__dirname + '/templates/resource/delete.html', 'utf8')
      );

      $templateCache.put('formio-helper/resource/edit.html',
        fs.readFileSync(__dirname + '/templates/resource/edit.html', 'utf8')
      );

      $templateCache.put('formio-helper/resource/index.html',
        fs.readFileSync(__dirname + '/templates/resource/index.html', 'utf8')
      );

      $templateCache.put('formio-helper/resource/view.html',
        fs.readFileSync(__dirname + '/templates/resource/view.html', 'utf8')
      );

      /**** FORM TEMPLATES *******/
      $templateCache.put('formio-helper/form/list.html',
        fs.readFileSync(__dirname + '/templates/form/list.html', 'utf8')
      );

      $templateCache.put('formio-helper/form/index.html',
        fs.readFileSync(__dirname + '/templates/form/index.html', 'utf8')
      );

      $templateCache.put('formio-helper/form/form.html',
        fs.readFileSync(__dirname + '/templates/form/form.html', 'utf8')
      );

      $templateCache.put('formio-helper/form/view.html',
        fs.readFileSync(__dirname + '/templates/form/view.html', 'utf8')
      );

      /**** SUBMISSION TEMPLATES *******/
      $templateCache.put('formio-helper/submission/index.html',
        fs.readFileSync(__dirname + '/templates/submission/index.html', 'utf8')
      );

      $templateCache.put('formio-helper/submission/submission.html',
        fs.readFileSync(__dirname + '/templates/submission/submission.html', 'utf8')
      );

      $templateCache.put('formio-helper/submission/view.html',
        fs.readFileSync(__dirname + '/templates/submission/view.html', 'utf8')
      );

      $templateCache.put('formio-helper/submission/edit.html',
        fs.readFileSync(__dirname + '/templates/submission/edit.html', 'utf8')
      );

      $templateCache.put('formio-helper/submission/delete.html',
        fs.readFileSync(__dirname + '/templates/submission/delete.html', 'utf8')
      );
    }
  ]);