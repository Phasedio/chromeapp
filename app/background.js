
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
var FURL = 'https://phaseddev.firebaseio.com/';
//var ref = new Firebase('https://phased-dev2.firebaseio.com/');
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

	     ref.child('team').child(user.curTeam).child('members').on('child_changed', function(childSnapshot) {
	       var newUpdate = childSnapshot.val();
	       //console.log(newUpdate.name);
	       //console.log(newUpdate);
         //console.log(newUpdate.user, authData.uid);

         ref.child('profile').child(newUpdate.currentStatus.user).once('value', function(notifier) {
           notifier = notifier.val();
           console.log(notifier.gravatar);
           var now = new Date().getTime;
           var r = now - newUpdate.currentStatus.time;
           if (notifier.email == user.email) {
             console.log('wont show anything');
           } else if(r > 5000 ){
             console.log('likely not an update');
           }else {

             spawnNotification(newUpdate.currentStatus.name + " - Phased.io", notifier.gravatar, notifier.name);

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
