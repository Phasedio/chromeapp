app.controller('LoginController',function(FURL, $scope,$location,Auth, ngDialog){

  var ref = new Firebase(FURL);

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
    console.log('will show new modal here');
		Auth.register(user).then(function() {

      console.log('will show new modal here');
      $location.path("/switchteam");
    });
  }

	$scope.makeAccount = function(){
		$scope.forms = "reg";
	}
	$scope.loginAccount = function(){
		$scope.forms = "login";
	};

  $scope.forgotPassword = function(email){
    console.log("will send email to :", email);
    ref.resetPassword({
      email : email
    }, function(error) {
      if (error === null) {
        console.log("Password reset email sent successfully");
      } else {
        console.log("Error sending password reset email:", error);
      }
    });
  }
   

});
