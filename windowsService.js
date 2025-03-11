import Service from 'node-windows';

//installing autodialer as a Windows service

// Create a new service object
var svc = new Service.Service({
  name:'JiraSearch',
  description: 'Zendesk-Jira integration',
  script: "./main.js",
  maxRetries: 3,

  env: {
    name: "HOME",
  },
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ],
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('install',function(){
  svc.start();
});

svc.install();