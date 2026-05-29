module.exports = {
  apps: [
    {
      name: "aplismart-motors-api",
      cwd: "/www/wwwroot/motors.aplismart.com/apps/api",
      script: "dist/main.js",
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3300",
        FRONTEND_URL: "https://motors.aplismart.com",
      },
    },
    {
      name: "aplismart-motors-web",
      cwd: "/www/wwwroot/motors.aplismart.com/apps/web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3301 -H 127.0.0.1",
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        API_INTERNAL_URL: "http://127.0.0.1:3300",
        NEXT_PUBLIC_APP_URL: "https://motors.aplismart.com",
      },
    },
  ],
};
