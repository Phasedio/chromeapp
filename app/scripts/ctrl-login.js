app.controller('LoginController',function($scope,$location,Auth){
	$scope.loginUser = function(user){
		Auth.login(user).then(function() {
	      // $scope.user = angular.copy(oriPerson);
	      // $scope.userForm.$setPristine();
          
          $location.path("/");
          }, function(err){
            alert('incorrect username/password');
          });
	}

});