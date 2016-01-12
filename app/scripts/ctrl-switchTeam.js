app.controller('SwitchTeamController',function($scope,FURL,Auth,Phased,$http,$location,ngDialog){
	$scope.currentUser = Phased.user.profile;
	
	// check if newUser is set; if so, show the newUser tutorial
	// (when the current user's profile data comes in in PhasedProvider)
	// replaces newUserCheck
	$scope.$on('Phased:currentUserProfile', function() {
		if (Phased.user.profile.newUser) {
		  _gaq.push(['_trackEvent', 'Tutorial', 'Main interaction']);
		  ngDialog.open({
		      template: 'views/partials/onboardMain.html',
		      className: 'ngdialog-theme-plain',
		      scope: $scope
		    });
		} else {
		  $scope.currentUser = Phased.user.profile;
		  $scope.$apply();
		}
	});

	$scope.switchTeam = function(teamName) {
		Phased.switchTeam(teamName, function callback() {
			$location.path('/');
		});
	}

	$scope.newTeam = function(){
		$location.path('/createteam');
	}

	$scope.closeAll = function(){
    	ngDialog.close();
    }
    $scope.next = function(){
    	ngDialog.close();
    }
});
