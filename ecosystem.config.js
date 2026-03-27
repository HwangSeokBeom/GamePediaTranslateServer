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
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
