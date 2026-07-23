package com.ledgerflow.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

/**
 * Minimal Bluetooth Classic (SPP) bridge for ESC/POS thermal printers.
 * The web layer builds the ESC/POS payload; this plugin only lists the paired
 * devices and moves raw bytes to one of them — no vendor SDK, no printer app.
 */
@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) }
)
public class ThermalPrinterPlugin extends Plugin {
    /** Standard Serial Port Profile UUID — what thermal printers speak. */
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    // BLUETOOTH_CONNECT exists (and is a runtime permission) only on Android 12+.
    private boolean missingPermission() {
        return Build.VERSION.SDK_INT >= 31 && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    @PluginMethod
    public void listPrinters(PluginCall call) {
        if (missingPermission()) { requestPermissionForAlias("bluetooth", call, "btPermCallback"); return; }
        doList(call);
    }

    @PluginMethod
    public void print(PluginCall call) {
        if (missingPermission()) { requestPermissionForAlias("bluetooth", call, "btPermCallback"); return; }
        doPrint(call);
    }

    @PermissionCallback
    private void btPermCallback(PluginCall call) {
        if (missingPermission()) { call.reject("Bluetooth permission was denied"); return; }
        if ("print".equals(call.getMethodName())) doPrint(call); else doList(call);
    }

    private void doList(PluginCall call) {
        BluetoothAdapter ad = adapter();
        if (ad == null) { call.reject("Bluetooth is not available on this device"); return; }
        if (!ad.isEnabled()) { call.reject("Bluetooth is turned off"); return; }
        JSArray devices = new JSArray();
        try {
            Set<BluetoothDevice> bonded = ad.getBondedDevices();
            for (BluetoothDevice d : bonded) {
                JSObject o = new JSObject();
                o.put("name", d.getName() == null ? d.getAddress() : d.getName());
                o.put("address", d.getAddress());
                devices.put(o);
            }
        } catch (SecurityException e) {
            call.reject("Bluetooth permission was denied");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("devices", devices);
        call.resolve(ret);
    }

    private void doPrint(PluginCall call) {
        String address = call.getString("address");
        String data = call.getString("data");
        if (address == null || data == null) { call.reject("address and data are required"); return; }
        BluetoothAdapter ad = adapter();
        if (ad == null) { call.reject("Bluetooth is not available on this device"); return; }
        if (!ad.isEnabled()) { call.reject("Bluetooth is turned off"); return; }
        byte[] bytes;
        try { bytes = Base64.decode(data, Base64.DEFAULT); }
        catch (IllegalArgumentException e) { call.reject("data must be base64"); return; }

        // Socket connect blocks — never on the WebView thread.
        new Thread(() -> {
            BluetoothSocket socket = null;
            try {
                BluetoothDevice device = ad.getRemoteDevice(address);
                try { ad.cancelDiscovery(); } catch (SecurityException ignored) {}
                socket = connectSocket(device);
                OutputStream out = socket.getOutputStream();
                out.write(bytes);
                out.flush();
                Thread.sleep(400); // let the printer drain its buffer before the link drops
                call.resolve();
            } catch (SecurityException e) {
                call.reject("Bluetooth permission was denied");
            } catch (Exception e) {
                call.reject("Could not reach the printer: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
            } finally {
                if (socket != null) { try { socket.close(); } catch (Exception ignored) {} }
            }
        }).start();
    }

    /**
     * Open an RFCOMM link, working around budget-printer firmware: the standard
     * secure SPP connect fails on many clones, so fall back to an insecure
     * socket, then to the reflection channel-1 socket every vendor print app
     * uses as a last resort.
     */
    private BluetoothSocket connectSocket(BluetoothDevice device) throws Exception {
        Exception last = null;
        try {
            BluetoothSocket s = device.createRfcommSocketToServiceRecord(SPP_UUID);
            s.connect();
            return s;
        } catch (Exception e) { last = e; }
        Thread.sleep(250); // give the printer's BT stack a beat between attempts
        try {
            BluetoothSocket s = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
            s.connect();
            return s;
        } catch (Exception e) { last = e; }
        Thread.sleep(250);
        try {
            BluetoothSocket s = (BluetoothSocket) device.getClass()
                .getMethod("createRfcommSocket", int.class).invoke(device, 1);
            s.connect();
            return s;
        } catch (Exception e) { last = e; }
        throw last;
    }
}
