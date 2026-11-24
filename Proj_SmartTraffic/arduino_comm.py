"""Compatibility shim for the retired Arduino Mega client name.

The production controller is Jetson Nano.  New code must import
``JetsonComm`` from :mod:`jetson_comm`; this module only keeps old scripts from
breaking while the project is being migrated.
"""

from jetson_comm import JetsonComm, main

ArduinoComm = JetsonComm

__all__ = ["JetsonComm", "ArduinoComm"]


if __name__ == "__main__":
    main()
