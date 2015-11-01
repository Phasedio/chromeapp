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
		Auth.register(user).then(function() {

      //$('#myModal').modal('toggle');
      ngDialog.open({
        template: 'views/partials/onboard.html',
        className: 'ngdialog-theme-plain',
        scope: $scope
      });
			//$location.path("/switchteam");

      //console.log('will show new modal here');


      //ngDialog.open({ template: '/partials/onboard.html' })
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
   ngDialog.open({
        template: 'views/partials/onboard.html',
        className: 'ngdialog-theme-plain',
        scope: $scope
      });

});
