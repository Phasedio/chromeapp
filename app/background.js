

var currentUser = {};
//var FURL = 'https://phaseddev.firebaseio.com/';
var ref = new Firebase('https://phaseddev.firebaseio.com/');

// var authClient = new FirebaseSimpleLogin(myRef, function(error, user) {
//   if (error) {
//     // an error occurred while attempting login
//     console.log(error);
//     alert(error);
//   } else if (user) {
//     // user authenticated with Firebase
//     console.log("User ID: " + user.uid + ", Provider: " + user.provider);
//     currentUser = user;
//     alert(currentUser);
//   } else {
//   	alert('Logged out');
//     // user is logged out
//   }
// });
ref.onAuth(function(authData) {
	if (authData) {
		//alert(authData);
		//var team = $scope.team;
	     ref.child('team').child('phased').child('task').on('child_changed', function(childSnapshot, prevChildKey) {
	       var newUpdate = childSnapshot.val();
	       
	      console.log(newUpdate.name);
	       ref.child('profile').child(newUpdate.user).once('value', function(user) {
	         user = user.val();
	         // console.log(user, $scope.newUpdate);
	         // console.log(user.gravatar);

	         // console.log('the current user is ', $scope.currentUser);

	         
	         
	         
	       });

	    });
	}

	 
});


 spawnNotification('test');

	         function spawnNotification(theBody,theIcon,theTitle) {

	          	var options = {
	              body: theBody,
	              icon: theIcon
	            }
	            var n = new Notification(theTitle,options);
	            setTimeout(n.close.bind(n), 5000);
	          }