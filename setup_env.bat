@echo off
echo Creating .env file for Threat Detection System...
echo.

if exist .env (
    echo .env file already exists!
    echo Please edit it manually or delete it first.
    pause
    exit /b 1
)

(
echo # Backend API Configuration
echo BACKEND_BASE_URL=http://127.0.0.1:5000
echo BACKEND_API_KEY=efecd5a4-40ff-45df-b1d9-0e3256f2265d
echo.
echo # InfluxDB Configuration
echo INFLUX_URL=http://localhost:8086
echo INFLUX_TOKEN=your_influxdb_token_here
echo INFLUX_ORG=SignalGeneriX
echo INFLUX_BUCKET=detectionAlerts
echo.
echo # Email Configuration ^(optional^)
echo EMAIL_RECEIVERS=admin@example.com
echo EMAIL_SMTP_HOST=smtp.gmail.com
echo EMAIL_SMTP_PORT=587
echo EMAIL_USERNAME=your_email@gmail.com
echo EMAIL_PASSWORD=your_app_password
) > .env

echo .env file created successfully!
echo.
echo Next steps:
echo 1. Edit the .env file to configure your settings
echo 2. For InfluxDB features, install and configure InfluxDB
echo 3. For email alerts, configure your email settings
echo.
echo Note: The system will work without InfluxDB, but alerts and logs
echo will not be persisted to a database.
echo.
pause 