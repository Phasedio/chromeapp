app.controller('LoginController',function($scope,$location,Auth){
	$scope.forms = "login";

	$scope.loginUser = function(user){
		Auth.login(user).then(function() {
	      // $scope.user = angular.copy(oriPerson);
	      // $scope.userForm.$setPristine();
          
          $location.path("/");
          }, function(err){
            alert('incorrect username/password');
          });
	}

	$scope.regUser = function(user){
		Auth.register(user).then(function() {
			$location.path("/switchteam");
		});
	}

	$scope.makeAccount = function(){
		$scope.forms = "reg";
	}
	$scope.loginAccount = function(){
		$scope.forms = "login";
	}

});