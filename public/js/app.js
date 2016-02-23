/**
 * Global Firebase references
 */

var firebaseRef = new Firebase('https://decides.firebaseio.com');
var geoFire = new GeoFire(firebaseRef.child('geofire'));

var groupsRef = firebaseRef.child('groups');
var votesRef = firebaseRef.child('votes');
var fingerprintsRef = firebaseRef.child('fingerprints');
var choicesRef = firebaseRef.child('choices');

/**
 * Group Id generator
 */

function generateGroupId () {
  var groupId = '';

  var possible = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  for(var i=0; i < 5; i++)
    groupId += possible.charAt(Math.floor(Math.random() * possible.length));

  window.location.hash = groupId;

  return groupId;
}

/**
 * Create Vue app
 */

var app = new Vue({
  el: '#app',
  data: {
    localFingerprint: '',
    choices: {},
    newChoice: {
      title: ''
    },
    fingerprints: {},
    vote: null,
    group: null,
    localGroups: [],
    newGroup: {},
    geoQuery: null
  },
  computed: {
    validation: function () {
      return {
        title: !!this.newChoice.title.trim(),
      }
    },
    isValid: function () {
      var validation = this.validation
      return Object.keys(validation).every(function (key) {
        return validation[key]
      })
    }
  },
  watch: {
    'vote': function (value, oldValue) {
      console.debug('vote watch triggered. value: ' + value + '. oldValue: '+ oldValue);

      groupsRef.child(this.group.id + '/members/' + this.localFingerprint + '/vote').set(value);

      if (this.choices[value]) {
        votesRef.child(value).child(this.localFingerprint).set(true);
        votesRef.child(value).once('value', refreshVoteCount)
      }
      if (this.choices[oldValue]) {
        votesRef.child(oldValue).child(this.localFingerprint).set(null);
        votesRef.child(oldValue).once('value', refreshVoteCount)
      }
    }
  },
  methods: {
    addChoice: function () {
      if (this.isValid) {
        this.newChoice.votes = 0;
        choicesRef.child(this.group.id).push(this.newChoice)
        this.newChoice.title = ''
      }
    },
    updateChoice: function (key, choice) {
      choicesRef.child(this.group.id).child(key).update(choice)
    },
    removeChoice: function (key) {
      choicesRef.child(this.group.id).child(key).remove()
    },
    updateFingerprint: function (key, fingerprint) {
      groupsRef.child(this.group.id).child('members').child(key).update(fingerprint);
    },
    addGroup: function () {
      var groupId = generateGroupId();
      var groupRef = groupsRef.child(groupId);

      groupRef.set({
        id: groupId,
        owner: this.localFingerprint,
        title: this.newGroup.title
      });

      if (this.geoQuery) {
        geoFire.set(groupId, this.geoQuery.center());
      } else {
        navigator.geolocation.getCurrentPosition(function (result) {
          var center = [result.coords.latitude, result.coords.longitude];
          this.geoQuery = { center: center, radius: 0.3 };
          geoFire.set(groupId, center);
        })
      }

      setupGroupSync(groupId);
    },
    loadGroup: function (groupId) {
      console.debug('Loading group: ' + groupId);

      window.location.hash = groupId;
      this.vote = null;

      setupGroupSync(groupId);
    },
    leaveGroup: function () {
      window.location.hash = "";
      this.group = null;
      this.vote = null;
    }
  }
})

/**
 * Setup Group Sync
 */

function setupGroupSync(groupId) {
  console.debug('Setting up group sync for id: ' + groupId)

  groupsRef.child(groupId).on('value', function (snapshot) {
    app.group = snapshot.val();
  });

  choicesRef.child(groupId).once('value', function (snapshot){
    console.debug('Loaded choices: ' + snapshot.key());
    console.debug(snapshot.val());

    app.choices = snapshot.val() || {};

    getVote(groupId);

    choicesRef.child(groupId).off();
    choicesRef.child(groupId).off();

    choicesRef.child(groupId).on('child_added', choiceAdded);
    choicesRef.child(groupId).on('child_removed', choiceRemoved);

    groupsRef.child(groupId).child('members').on('child_added', indexChildAdded);

    document.getElementById("app").style.visibility = "visible";
    document.getElementById("loading").style.visibility = "hidden";
  });
}

function choiceAdded (snapshot) {
  console.debug('Added choice: ' + snapshot.key());

  Vue.set(app.choices, snapshot.key(), snapshot.val());

  choicesRef.child(app.group.id).child(snapshot.key()).on('value', choiceUpdated)
}

function choiceRemoved (snapshot) {
  console.debug('Removed choice: ' + snapshot.key());

  Vue.delete(app.choices, snapshot.key());
}

function choiceUpdated (snapshot) {
  console.debug('Updated choice: ' + snapshot.key());

  Vue.set(app.choices, snapshot.key(), snapshot.val());
}

function indexChildAdded (snapshot) {
  Vue.set(app.fingerprints, snapshot.key(), snapshot.val());
}

/**
 * Load group
 */

function tryLoadGroup (groupId) {
  groupsRef.child(groupId).once('value', function (snapshot) {
    if (!snapshot.exists()) {
      console.debug('No group with id: ' + groupId)
      return;
    }

    setupGroupSync(snapshot.key());
  });
}

/**
 * GeoFire
 */

navigator.geolocation.getCurrentPosition(function (result) {
  app.geoQuery = geoFire.query({
    center: [result.coords.latitude, result.coords.longitude],
    radius: 0.3
  });

  app.geoQuery.on("key_entered", function(key, location, distance) {
    groupsRef.child(key).child('title').once('value', function(snapshot){
      app.localGroups.push({key: key, title:snapshot.val(), distance: distance })
    })
  });
});

/**
 * Votes
 */

function refreshVoteCount (snapshot) {
  console.debug('Refreshing votes for: ' + snapshot.key());

  choicesRef.child(app.group.id).child(snapshot.key()).child('votes').transaction(function (votes) {
    return snapshot.numChildren();
  })
}

function getVote (groupId) {
  if(!app.localFingerprint){
    new Fingerprint2().get(function(result){
      app.localFingerprint = result;
    });

    return;
  }

  groupsRef.child(groupId + '/members/' + app.localFingerprint + '/vote').once('value', function (snapshot) {
    app.vote = snapshot.val();
  });
}

/**
 * OnLoad
 */

window.onload = function () {
  new Fingerprint2().get(function(result){
    app.localFingerprint = result;
  });

  if (window.location.hash) {
    tryLoadGroup(window.location.hash.substring(1))
  } else {
    document.getElementById("app").style.visibility = "visible";
    document.getElementById("loading").style.visibility = "hidden";
  }
}