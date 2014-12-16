/** @jsx React.DOM */

var githubbers = {};

var GitHubPerson = React.createClass({
  getInitialState: function() {
    // We are given a github name
    if (githubbers[name]) {
      return githubbers[name];
    }
    return {
      username: '',
      name: '',
      avatar_url: ''
    };
  },

  componentDidMount: function() {
    var handle = this.props.handle.toLowerCase();
    $.ajax('/user/'+handle, {
      format: 'json',
      success: function(data) {
        if (data.avatar_url.indexOf('?') != -1) {
          data.avatar_url = data.avatar_url + '&s=32';
        } else {
          data.avatar_url = data.avatar_url + '?s=32';
        }
        if (this.isMounted()) {
          this.setState({
            username: data.login,
            avatar_url: data.avatar_url,
            html_url: data.html_url,
            name: data.name
          });
        }
        githubbers[handle] = {
          username: data.login,
          avatar_url: data.avatar_url,
          name: data.name
        };
      }.bind(this),
      error: function(data, error) {
        console.log("GOT ERROR", error, data)
      }
    });
  },

  render: function() {
    var name = this.props.handle;
    return (
      <a href={this.state.html_url} title={this.state.name}>
        <img className="avatar" src={this.state.avatar_url}/>
      </a>);
  }
});

var MentionsList = React.createClass({
  render: function() {
    var createMention = function(item, index) {
      if (item.value.question == 'mention') {

        return (<li><GitHubPerson handle={item.value.fromwhom }/> <b>{item.value.fromwhom }</b> made a mention on issue <a href={item.value.ref_html_url}>{item.value.issue}</a>
                </li>);
      } else {
        return (<li><GitHubPerson handle={item.value.fromwhom }/> <b>{item.value.fromwhom }</b> asked 
                    for <b>{item.value.question}</b> on issue <a href={item.value.ref_html_url}>{item.value.issue}</a>
                </li>);
      }
    };
    var mentionsList = [];
    var mentions = this.props.mentions
    for (var key in mentions) {
        if (mentions.hasOwnProperty(key)) {
            mentionsList.push({key:key, value:mentions[key]})
        }
    }
    return <ul>{ mentionsList.map(createMention) }</ul>;
  }
});

var MentionsApp = React.createClass({
  mixins: [ReactFireMixin],

  getInitialState: function() {
    return {handle: this.props.handle};
  },

  componentWillMount: function() {
    var firebaseRef = new Firebase("https://debt.firebaseio.com/asks").child(this.state.handle);
    this.bindAsObject(firebaseRef, "mentions");
  },

  onChange: function(e) {
    this.setState({handle: e.target.value});
  },

  render: function() {
    return (
      <div>
        <MentionsList mentions={this.state.mentions}/>
      </div>
    );
  }
});

