# Jetson Nano traffic controller quick start

The laptop AI connects to the Jetson GPIO controller at `192.168.16.210:8080` over Ethernet.

## Understand the three network states

On the laptop, run:

```powershell
.\KIEM_TRA_KET_NOI_JETSON.ps1
```

| Result | Meaning |
| --- | --- |
| `Ping=OK`, `SSH_22=OPEN`, `GpioService_8080=OFFLINE` | Jetson and RJ45 network are working; the GPIO service is deliberately stopped. This is the expected safe state before hardware verification. |
| `GpioService_8080=ONLINE` | The controller is running and can change wired LEDs/7-segment displays when it receives commands. |
| `Ping=FAIL` | Check Jetson power, RJ45 link LEDs, laptop Ethernet IP `192.168.16.50/24`, and Jetson IP `192.168.16.210/24`. |

The check script is read-only: it does not start a service or change GPIO.

## Before starting GPIO

1. Turn off Jetson and the external load supply before changing any wire.
2. Verify 3.3 V GPIO logic only goes to a compatible driver/level shifter. Do not feed a 5 V/12 V signal back into Jetson pins.
3. Verify relay/buzzer/LED loads use the driver and external supply, with GND joined only at the driver if the circuit is non-isolated.
4. Power Jetson from its proper 5 V/4 A DC input, then turn on the external load supply.

## Start and stop

Only after the wiring checklist passes, on Jetson:

```bash
sudo systemctl start jetson-traffic-gpio.service
sudo systemctl status jetson-traffic-gpio.service
```

The status should be `active (running)`. From the laptop, `KIEM_TRA_KET_NOI_JETSON.ps1` should then show `GpioService_8080=ONLINE`.

For the first hardware run, use `CHAY_VIDEO_MAU.bat`; it uses `--count-only`, so no violation alert is sent. To de-energize driver outputs and blank the displays:

```bash
sudo systemctl stop jetson-traffic-gpio.service
```

The controller initializes all externally driven outputs off and also runs `safe_off()` during cleanup. Physical LED/relay/buzzer behavior must still be checked by eye and meter after wiring.
