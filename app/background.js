
// Copyright (c) 2011 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Called when the user clicks on the browser action.
chrome.browserAction.onClicked.addListener(function(tab) {
  // No tabs or host permissions needed!
  console.log('opening new tab');
  var action_url = "chrome://newtab";
  chrome.tabs.create({ url: action_url });

});


var currentUser = {};
//var FURL = 'https://phaseddev.firebaseio.com/';
var ref = new Firebase('https://phaseddev.firebaseio.com/');
console.log("this is working in the background!");


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
    console.log(authData.uid);
    ref.child('profile').child(authData.uid).once('value', function(user) {
      user = user.val();
      currentUser = user;
      console.log(user);
      console.log(user.curTeam);

	     ref.child('team').child(user.curTeam).child('task').on('child_changed', function(childSnapshot) {
	       var newUpdate = childSnapshot.val();
	       console.log(newUpdate.name);
	       //console.log(newUpdate);
         //console.log(newUpdate.user, authData.uid);

         ref.child('profile').child(newUpdate.user).once('value', function(notifier) {
           notifier = notifier.val();
           console.log(notifier.gravatar);

           if (notifier.email == user.email) {
             console.log('wont show anything');
           } else {

             spawnNotification(newUpdate.name + " - Phased.io", notifier.gravatar, notifier.name);

             function spawnNotification(theBody, theIcon, theTitle) {

               var options = {
                 body: theBody,
                 icon: theIcon
               };

               var n = new Notification(theTitle, options);
               setTimeout(n.close.bind(n), 5000);
             }
           }
         });





         //console.log('the current user is ', $scope.currentUser);

         //if($scope.currentUser.email == user.email){
         //  console.log('wont do anything');
         //}else {
         //  spawnNotification($scope.newUpdate.name + " - Phased.io", user.gravatar, user.name);
         //
         //  function spawnNotification(theBody,theIcon,theTitle) {
         //
         //    var options = {
         //      body: theBody,
         //      icon: theIcon
         //    }
         //    var n = new Notification(theTitle,options);
         //    setTimeout(n.close.bind(n), 5000);
         //  }
         //}

	       //ref.child('profile').child(newUpdate.user).once('value', function(user) {
	       //  user = user.val();
	         // console.log(user, $scope.newUpdate);
	         // console.log(user.gravatar);

	         // console.log('the current user is ', $scope.currentUser);


         //});


	       });

	    });
	}


});


 //spawnNotification('test');

	         function spawnNotification(theBody,theIcon,theTitle) {

	          	var options = {
	              body: theBody,
	              icon: theIcon
	            }
	            var n = new Notification(theTitle,options);
	            setTimeout(n.close.bind(n), 5000);
	          }

