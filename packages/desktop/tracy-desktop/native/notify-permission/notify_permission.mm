// Tracy Cowork: whether macOS lets this app show notifications (src/notify-permission.js).
//
//   read(callback) -> undefined; later callback("allowed" | "denied" | "notDetermined" | "unknown")
//
// Asks UNUserNotificationCenter.getNotificationSettings, which answers for the app that calls it —
// this addon runs inside the app's main process, so that is the app itself. Read only: it never calls
// requestAuthorization (no prompt) and never sets the center's delegate (Electron owns it). The
// completion handler runs on a system queue; the answer reaches JavaScript through a thread-safe
// function. A process with no bundle identifier (plain Node, tests) has no notification center —
// asking would raise — so it answers "unknown" without asking.
//
// Plain N-API (no node-addon-api, no Electron headers): the ABI is stable across Node and Electron,
// so the headers of any Node >= 18 build it. Build: build/build-native.sh.

#define NAPI_VERSION 8
#include <node_api.h>

#import <Foundation/Foundation.h>
#import <UserNotifications/UserNotifications.h>

static const char* StatusName(UNAuthorizationStatus status) {
  switch (status) {
    case UNAuthorizationStatusAuthorized:
    case UNAuthorizationStatusProvisional:
      return "allowed";
    case UNAuthorizationStatusDenied:
      return "denied";
    case UNAuthorizationStatusNotDetermined:
      return "notDetermined";
    default:
      return "unknown";
  }
}

// Runs on the JavaScript thread: hands the answer (a static string) to the callback.
static void CallJs(napi_env env, napi_value callback, void* /*context*/, void* data) {
  if (env == nullptr || callback == nullptr) return;
  napi_value undefined;
  napi_value argv[1];
  napi_get_undefined(env, &undefined);
  napi_create_string_utf8(env, static_cast<const char*>(data), NAPI_AUTO_LENGTH, &argv[0]);
  napi_call_function(env, undefined, callback, 1, argv, nullptr);
}

// One answer, from any thread, then the function is released.
static void Answer(napi_threadsafe_function tsfn, const char* status) {
  napi_call_threadsafe_function(tsfn, const_cast<char*>(status), napi_tsfn_blocking);
  napi_release_threadsafe_function(tsfn, napi_tsfn_release);
}

static napi_value Read(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_value undefined;
  napi_get_undefined(env, &undefined);
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok || argc < 1) {
    napi_throw_type_error(env, nullptr, "read takes a callback");
    return undefined;
  }
  napi_valuetype type;
  napi_typeof(env, argv[0], &type);
  if (type != napi_function) {
    napi_throw_type_error(env, nullptr, "read takes a callback");
    return undefined;
  }

  napi_value name;
  napi_create_string_utf8(env, "tracyNotifyPermission", NAPI_AUTO_LENGTH, &name);
  napi_threadsafe_function tsfn;
  if (napi_create_threadsafe_function(env, argv[0], nullptr, name, 0, 1, nullptr, nullptr, nullptr, CallJs,
                                      &tsfn) != napi_ok) {
    napi_throw_error(env, nullptr, "could not create the callback");
    return undefined;
  }
  // A pending read never keeps the process alive: the JavaScript side has its own timeout.
  napi_unref_threadsafe_function(env, tsfn);

  @autoreleasepool {
    if ([[NSBundle mainBundle] bundleIdentifier] == nil) {
      Answer(tsfn, "unknown");
      return undefined;
    }
    @try {
      UNUserNotificationCenter* center = [UNUserNotificationCenter currentNotificationCenter];
      [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings* settings) {
        Answer(tsfn, settings == nil ? "unknown" : StatusName(settings.authorizationStatus));
      }];
    } @catch (NSException* exception) {
      Answer(tsfn, "unknown");
    }
  }
  return undefined;
}

NAPI_MODULE_INIT() {
  napi_value read;
  napi_create_function(env, "read", NAPI_AUTO_LENGTH, Read, nullptr, &read);
  napi_set_named_property(env, exports, "read", read);
  return exports;
}
