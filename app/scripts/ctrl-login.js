app.controller('LoginController',function(FURL, $scope,$location,Auth, ngDialog){

  var ref = new Firebase(FURL);

  $scope.forms = "login";

	$scope.loginUser = function(user){

    //$scope.dialog = ngDialog.open({
    //  template: 'popupTmpl',
    //  className: 'ngdialog-theme-plain',
    //  scope: $scope
    //});

    ngDialog.open({

      template: 'views/partials/onboard.html',
      className: 'ngdialog-theme-plain',
      scope: $scope
    });

    $scope.next = function(){

      console.log('will show next page');
      ngDialog.open({

        template: 'views/partials/onboardMain.html',
        className: 'ngdialog-theme-plain',
        scope: $scope
      });
    }

    $scope.closeAll = function(){
      ngDialog.close();
    }


    //just to do testing, unslash this out before committing


		//Auth.login(user).then(function() {
        //
	     //// $scope.user = angular.copy(oriPerson);
	     //// $scope.userForm.$setPristine();
        //
         //$location.path("/");
         //}, function(err){
         //   alert('incorrect username/password');
         //});
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
