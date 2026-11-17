// Startup file for cPanel "Setup Node.js App" (WHC / CloudLinux + Passenger).
//
// GitHub Actions builds the app and puts a ready-to-run copy on the `deploy`
// branch: this file at the top, the Next.js server inside ./standalone.
// Nothing needs to be installed or built on the server.
//
// The server lives in a subfolder because cPanel's Node.js selector manages its
// own `node_modules` link at the app root and refuses a real folder there.

process.env.NODE_ENV = 'production';
// Some hosts set HOSTNAME to the machine name, which would make Next.js listen on the wrong interface.
process.env.HOSTNAME = '0.0.0.0';

require('./standalone/server.js');
