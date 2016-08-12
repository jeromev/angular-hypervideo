/**
 * @license angular-hypervideo
 * Jérôme Vogel https://github.com/jeromev
 * License: MIT
 */
'use strict';
angular
  .module('angular-hypervideo', [
    'com.2fdevs.videogular',
    'com.2fdevs.videogular.plugins.controls',
    'com.2fdevs.videogular.plugins.buffering',
    'uk.ac.soton.ecs.videogular.plugins.cuepoints'
  ])
  .config([
    '$stateProvider',
    '$urlRouterProvider',
    function($stateProvider, $urlRouterProvider) {
      $urlRouterProvider.otherwise('/scene/1');
      $stateProvider
        .state('scene', {
          url: '/scene/{sceneInt:int}',
          templateUrl: 'views/scene.html',
          controller: 'sceneController'
        })
      ;
    }
  ])
  .controller('sceneController', [
    '$scope',
    '$rootScope',
    '$http',
    '$sce',
    '$stateParams',
    '$location',
    function($scope, $rootScope, $http, $sce, $stateParams, $location) {
      // add general class to <html/>
      $rootScope.docClass = 'scene';
      // set doc title
      $rootScope.title = 'En cours';
      // Video state
      $rootScope.vgState = 'play';
      // $scope.shotIndex is the cached version of the shot index
      $scope.shotIndex = 0;
      // evaluate current scene number (first scene is 1)
      $stateParams.sceneInt = Math.min(parseInt($stateParams.sceneInt), 1);
      // compute scene id (pattern: xxx; example: 001)
      $scope.sceneCurrentId = (
        $stateParams.sceneInt < 100 ? (
          $stateParams.sceneInt < 10 ? '00'
          : '0'
        )
        : ''
      ) + $stateParams.sceneInt;
      // add scene class to <html>
      $rootScope.docClass += ' scene-' + $scope.sceneCurrentId;
      // set videogular (vg) API
      $scope.vgAPI = null;
  		$scope.vgOnPlayerReady = function vgOnPlayerReady(API) {
  			$scope.vgAPI = API;
        $scope.vgAPI.setVolume(0);
  		};
      $scope.vgPlay = function vgPlay() {
        $rootScope.vgState = 'play';
        if ($scope.vgAPI.currentState === 'pause') {
          $scope.vgAPI.play();
        }
      };
      $scope.silentScroll = false;
      $scope.latency = 0.3; // seconds
      // update function
      $scope.$on('vgUpdate', function vgUpdate(event, params) {
        if (typeof $scope.vgAPI.cuePoints.shots[params.index] === 'undefined') {
          return;
        }
        if (params.silentScroll === true) {
          $scope.silentScroll = true;
        }
        // update shot index only if loop is false or jump is not continous
        if (params.loop === false || Math.abs(params.index - $scope.shotIndex) > 0) {
          // turn on the shot
          $scope.$broadcast('vgShot.on', {
            id: $scope.vgAPI.cuePoints.shots[params.index].shotId
          });
          // update the index
          $scope.shotIndex = params.index;
          // update the url
          $location.hash(
            $scope.vgAPI.cuePoints.shots[$scope.shotIndex].shotId
          ).replace();
          $scope.vgPlay();
          // refresh
          $scope.$apply();
        }
        if (params.moveNeedle || params.loop) {
          // move the needle
          $scope.vgAPI.seekTime(
            $scope.vgAPI.cuePoints.shots[$scope.shotIndex].timeLapse.start
          );
          $scope.vgPlay();
        }
      });
      $http
        // look for /data/scene-xxx.json file
        .get('/data/scene-' + $scope.sceneCurrentId + '.json')
        .success(function(data) {
          //
          var shots = [];
          var cuepoints = [];
          // make the data accessible within the scope
          $scope.scene = data;
          // construct the shots; for each shot…
          $scope.scene.shots.forEach(function(shot, index) {
            shot.in = parseFloat(shot.in);
            shot.out = parseFloat(shot.out);
            // store cue points for the cuepoints plugin
            cuepoints.push({
              time: shot.in
            });
            shots.push({
              // … extract cue points
              timeLapse: {
                start: shot.in,
                end: shot.out,
                index: index,
                loop: shot.loop === '1'? true : false
              },
              shotId: shot.id,
              // set methods
              onUpdate: function onUpdate(currentTime, timeLapse, params) {
                if ($rootScope.vgState === 'play') {
                  $scope.vgPlay();
                }
                if (typeof $scope.vgAPI.cuePoints.shots[timeLapse.index] !== 'undefined' && (
                    $scope.shotIndex !== timeLapse.index || (
                      currentTime >= timeLapse.end - $scope.latency &&
                      $scope.vgAPI.cuePoints.shots[$scope.shotIndex].timeLapse.loop === true
                    )
                  )) {
                  $scope.$broadcast('vgUpdate', {
                    index: timeLapse.index,
                    moveNeedle: false,
                    loop: $scope.vgAPI.cuePoints.shots[$scope.shotIndex].timeLapse.loop,
                    silentScroll: true
                  });
                }
              }
            });
          });
          // setup the vg config object
          $scope.vgConfig = {
      			controls: false,
            preload: 'auto',
            autoPlay: true,
            loop: true,
            transclude: true,
      			sources: [{
              src: $sce.trustAsResourceUrl($scope.scene.src),
              // src: 'https://www.youtube.com/watch?v=wN8_eb3l0mw'
              type: $scope.scene.type
            }],
            cuePoints: {
              shots: shots
            },
            plugins: {
              cuepoints: {
                points: cuepoints
              }
            }
      		};
        })
        .error(function(data, status, headers, config) {
          console.log('cannot load data');
        })
      ;
      $scope.scrollTo = function scrollTo(id) {
        $location.hash(id).replace();
      };
      $scope.vgPlayPause = function vgPlayPause() {
        $scope.vgAPI.playPause();
        // signal the state
        if ($rootScope.vgState === 'pause') {
          $rootScope.vgState = 'play';
        } else {
          $rootScope.vgState = 'pause';
        }
      };
    }
  ])
  .directive('myWatchScroll',  [
    '$window',
    function($window) {
      function link($scope, $element, $attributs) {
        var scroll = false;
        var resize = false;
        $element.on('scroll', function() {
          scroll = true;
        });
        angular.element($window).bind('resize', function() {
          resize = true;
        });
        setInterval(function() {
          if ($scope.silentScroll !== true && (scroll || resize)) {
            scroll = false;
            resize = false;
            // evaluate the current index based on the scroll position
            var scrollShotIndex = Math.round($element[0].scrollTop / $element[0].clientHeight);
            // if the current index differs from the stored index
            if (scrollShotIndex !== $scope.shotIndex) {
              // then update the video
              $scope.$broadcast('vgUpdate', {
                index: scrollShotIndex,
                moveNeedle: true,
                loop: false,
                silentScroll: false
              });
            }
          } else {
            $scope.silentScroll = false;
          }
        }, $scope.latency * 1000);
      }
      return {
        restrict: 'A',
        link: link
      };
    }
  ])
  .directive('myShotOn', function() {
    function link($scope, $element, $attributs) {
      $scope.$on('vgShot.on', function(event, params) {
        if ($attributs.id === params.id) {
          $element.toggleClass('on', true);
        } else {
          $element.toggleClass('on', false);
        }
      });
    }
    return {
      restrict: 'A',
      link: link
    };
  })
;
