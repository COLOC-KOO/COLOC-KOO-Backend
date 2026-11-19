module.exports = {
  apps: [
    {
      name: 'colockoo-api',
      script: 'src/server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '750M',
    },
  ],
}
