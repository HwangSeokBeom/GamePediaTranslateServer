module.exports = {
  apps: [
    {
      name: 'translate-server',
      cwd: __dirname,
      script: 'src/app.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env_development: {
        NODE_ENV: 'development',
        PORT: '3000',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
    },
    {
      name: 'translate-server-staging',
      cwd: __dirname,
      script: 'src/app.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env_staging: {
        NODE_ENV: 'staging',
        PORT: '3100',
      },
    },
  ],
};
