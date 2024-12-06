const stompit = require('stompit');
const WebSocket = require('ws');

// Creation of the WebSocket server

// Define WebSocket server on port 4242
const wss = new WebSocket.Server({ port: 4242 });

// Broadcast function to send messages to all connected clients
function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}


// Define connection headers
const connectionHeaders = {
  "heart-beat": "50000,0",
  host: "/",
  'client-id': '3DSEpita-YKFL', // Unique Client ID
  login: 'b3935f56-98da-4d38-ab19-6a44660cdb11', // Your CLM Agent login
  passcode: '$h~$7p4!:q=LtCuNHqG4G%q"' // CLM Agent passcode
};

// Define servers for failover
const servers = [ 
  { ssl: true, host: 'eu1-msgbus.3dexperience.3ds.com', port: 61616, connectHeaders: connectionHeaders },
  { ssl: true, host: 'eu1-msgbus-1.3dexperience.3ds.com', port: 61616, connectHeaders: connectionHeaders }
];

// Initialize stompit failover manager
const manager = new stompit.ConnectFailover(servers, {
  initialReconnectDelay: 100, // Start with 1 second delay
  maxReconnectDelay: 30000, // Maximum delay of 30 seconds
  useExponentialBackOff: true, // Exponential backoff
  maxReconnects: 30, // Retry a maximum of 10 times before giving up
  randomize: false // Disable randomization
});

// Define subscription headers
const subscribeHeaders = {
  'destination': '/topic/3dsevents.R1132102747346.3DSpace.user', // Tenant ID topic
  'activemq.subscriptionName': 'BSYGDYEHDUUE226373', // Unique subscription name
  'ack': 'client-individual' // Acknowledge mode
};

console.log('Connection to the message broker...');
// Connect to the broker
manager.connect((error, client, reconnect) => {
  if (error) {
    console.error('Connection error:', error.message);
    return;
  }

  console.log('Connected to the message broker');

  // Subscribe to the topic
  client.subscribe(subscribeHeaders, (subscribeError, message) => {
    if (subscribeError) {
      console.error('Subscription error:', subscribeError.message);
      return;
    }

    // Read the message

    message.readString('utf-8', (readError, body) => {
      if (readError) {
        console.error('Error reading message:', readError.message);
        return;
      }
    
      try {
        // Attempt to parse the message as JSON and pretty-print
        const jsonMessage = JSON.parse(body);
        console.log('Received message:', JSON.stringify(jsonMessage, null, 2));

        // Broadcast the event to all WebSocket clients
        broadcast(JSON.stringify(jsonMessage));
      } catch (parseError) {
        // If the message is not JSON, log it as a plain string
        console.log('Received non-JSON message:', body);
      }
    
      // Acknowledge the message
      client.ack(message);
    });


  });

  // Disconnect the client on application exit
  process.on('SIGINT', () => {
    console.log('Disconnecting from broker');
    client.disconnect();
    process.exit();
  });
});


// WebSocket server ready
wss.on('connection', (ws) => {
  console.log('Frontend connected to WebSocket');
  ws.on('message', (message) => {
    console.log('Received from frontend:', message);
    // Handle incoming messages from the frontend if needed
  });
});