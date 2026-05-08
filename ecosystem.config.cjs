module.exports = {
  apps: [
    {
      name: 'webapp',
      script: './node_modules/.bin/vite',
      args: '--host 0.0.0.0 --port 3000',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'development',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
