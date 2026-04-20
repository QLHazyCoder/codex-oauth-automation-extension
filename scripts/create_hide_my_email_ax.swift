#!/usr/bin/env swift

import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

let label = ProcessInfo.processInfo.environment["HIDE_MY_EMAIL_LABEL"] ?? "Codex"
let bundleID = "com.apple.systempreferences"
let iCloudURL = "x-apple.systempreferences:com.apple.systempreferences.AppleIDSettings:icloud"
let iCloudWindowTitleHints = ["iCloud", "iCloud+"]

let hideMyEmailDescriptions = ["隐藏邮件地址", "Hide My Email"]
let accountNavigationTerms = ["iCloud", "Apple账户", "Apple Account"]
let createButtonTitles = ["创建新地址", "Create New Address"]
let continueButtonTitles = ["继续", "Continue"]
let doneButtonTitles = ["完成", "Done"]
let cancelButtonTitles = ["取消", "Cancel"]
let passwordPromptTerms = ["输入密码", "Apple ID", "Apple Account", "密码", "Password", "账户详细信息", "account details"]
let passwordPromptStrongTerms = ["输入密码", "密码", "Password", "账户详细信息", "account details", "忘记密码", "Forgot Password"]
let passwordContinueButtonTitles = ["继续", "Continue", "下一步", "Next", "登录", "Sign In", "允许", "Allow", "好", "OK"]
let launchTimeout: TimeInterval = 20
let transitionTimeout: TimeInterval = 20
let transitionAttempts = 3
let appleIDPassword = (ProcessInfo.processInfo.environment["HIDDEN_MAIL_APPLE_ID_PASSWORD"] ?? "")
    .trimmingCharacters(in: .whitespacesAndNewlines)

func fail(_ message: String) -> Never {
    fputs("\(message)\n", stderr)
    exit(1)
}

func attr(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else {
        return nil
    }
    return value
}

func strAttr(_ element: AXUIElement, _ name: String) -> String? {
    attr(element, name) as? String
}

func children(of element: AXUIElement) -> [AXUIElement] {
    attr(element, kAXChildrenAttribute) as? [AXUIElement] ?? []
}

func parent(of element: AXUIElement) -> AXUIElement? {
    guard let value = attr(element, kAXParentAttribute) else {
        return nil
    }
    return unsafeBitCast(value, to: AXUIElement.self)
}

func actionNames(of element: AXUIElement) -> [String] {
    var value: CFArray?
    guard AXUIElementCopyActionNames(element, &value) == .success,
          let array = value as? [String] else {
        return []
    }
    return array
}

func closeButton(of element: AXUIElement) -> AXUIElement? {
    guard let value = attr(element, kAXCloseButtonAttribute) else {
        return nil
    }
    return unsafeBitCast(value, to: AXUIElement.self)
}

func cgPointAttr(_ element: AXUIElement, _ name: String) -> CGPoint? {
    guard let value = attr(element, name) else {
        return nil
    }
    let axValue = unsafeBitCast(value, to: AXValue.self)
    guard AXValueGetType(axValue) == .cgPoint else {
        return nil
    }
    var point = CGPoint.zero
    return AXValueGetValue(axValue, .cgPoint, &point) ? point : nil
}

func cgSizeAttr(_ element: AXUIElement, _ name: String) -> CGSize? {
    guard let value = attr(element, name) else {
        return nil
    }
    let axValue = unsafeBitCast(value, to: AXValue.self)
    guard AXValueGetType(axValue) == .cgSize else {
        return nil
    }
    var size = CGSize.zero
    return AXValueGetValue(axValue, .cgSize, &size) ? size : nil
}

func walkElements<T>(startingAt element: AXUIElement, visit: (AXUIElement) -> T?) -> T? {
    var stack: [AXUIElement] = [element]
    var seen = Set<CFHashCode>()

    while let current = stack.popLast() {
        let hash = CFHash(current)
        if seen.contains(hash) {
            continue
        }
        seen.insert(hash)

        if let found = visit(current) {
            return found
        }

        stack.append(contentsOf: children(of: current).reversed())
    }

    return nil
}

func systemSettingsApp() -> NSRunningApplication? {
    NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).first
}

func systemSettingsElement() -> AXUIElement? {
    guard let app = systemSettingsApp() else {
        return nil
    }
    return AXUIElementCreateApplication(app.processIdentifier)
}

func iCloudWindow() -> AXUIElement? {
    guard let appElement = systemSettingsElement() else {
        return nil
    }

    let windows = attr(appElement, kAXWindowsAttribute) as? [AXUIElement] ?? []
    return windows.first {
        let title = strAttr($0, kAXTitleAttribute) ?? ""
        return iCloudWindowTitleHints.contains(where: { hint in !hint.isEmpty && title.contains(hint) })
    }
}

func focusedSystemSettingsWindow() -> AXUIElement? {
    guard let appElement = systemSettingsElement(),
          let value = attr(appElement, kAXFocusedWindowAttribute) else {
        return nil
    }
    return unsafeBitCast(value, to: AXUIElement.self)
}

func mainSystemSettingsWindow() -> AXUIElement? {
    guard let appElement = systemSettingsElement(),
          let value = attr(appElement, kAXMainWindowAttribute) else {
        return nil
    }
    return unsafeBitCast(value, to: AXUIElement.self)
}

func anySystemSettingsWindow() -> AXUIElement? {
    guard let appElement = systemSettingsElement() else {
        return nil
    }

    let windows = attr(appElement, kAXWindowsAttribute) as? [AXUIElement] ?? []
    return windows.first
}

func systemSettingsWindows() -> [AXUIElement] {
    guard let appElement = systemSettingsElement() else {
        return []
    }
    return attr(appElement, kAXWindowsAttribute) as? [AXUIElement] ?? []
}

func preferredSystemSettingsWindow() -> AXUIElement? {
    iCloudWindow() ?? focusedSystemSettingsWindow() ?? mainSystemSettingsWindow() ?? anySystemSettingsWindow()
}

func currentWindowDiagnostics() -> String {
    guard let appElement = systemSettingsElement() else {
        return "system-settings-app=missing"
    }

    let windows = (attr(appElement, kAXWindowsAttribute) as? [AXUIElement] ?? []).map {
        strAttr($0, kAXTitleAttribute) ?? "<untitled>"
    }
    let focusedTitle = focusedSystemSettingsWindow().flatMap { strAttr($0, kAXTitleAttribute) } ?? "<none>"
    let mainTitle = mainSystemSettingsWindow().flatMap { strAttr($0, kAXTitleAttribute) } ?? "<none>"
    let preferredTitle = preferredSystemSettingsWindow().flatMap { strAttr($0, kAXTitleAttribute) } ?? "<none>"
    return "preferred=\(preferredTitle) focused=\(focusedTitle) main=\(mainTitle) windows=\(windows.joined(separator: ", "))"
}

@discardableResult
func waitUntil(timeout: TimeInterval = 15, interval: TimeInterval = 0.2, _ condition: () -> Bool) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
        if condition() {
            return true
        }
        RunLoop.current.run(until: Date().addingTimeInterval(interval))
    }
    return false
}

func activateSystemSettings() {
    guard let app = systemSettingsApp() else {
        return
    }
    _ = app.activate(options: [.activateAllWindows])
}

func terminateSystemSettingsIfRunning() {
    guard let app = systemSettingsApp() else {
        return
    }

    if app.terminate() {
        if waitUntil(timeout: 5, {
            systemSettingsApp() == nil
        }) {
            return
        }
    }

    _ = app.forceTerminate()
    _ = waitUntil(timeout: 5, {
        systemSettingsApp() == nil
    })
}

func ensureSystemSettingsWindow() {
    if anySystemSettingsWindow() != nil {
        activateSystemSettings()
        return
    }

    guard let appURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleID) else {
        fail("failed to resolve System Settings.app")
    }

    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = true

    var launchError: Error?
    let semaphore = DispatchSemaphore(value: 0)
    NSWorkspace.shared.openApplication(at: appURL, configuration: configuration) { _, error in
        launchError = error
        semaphore.signal()
    }
    semaphore.wait()

    if let launchError {
        fail("failed to launch System Settings: \(launchError.localizedDescription)")
    }

    guard waitUntil(timeout: launchTimeout, {
        activateSystemSettings()
        return anySystemSettingsWindow() != nil
    }) else {
        fail("timed out waiting for a System Settings window")
    }
}

func iCloudWindowReadyToContinue(_ window: AXUIElement) -> Bool {
    findPressableElement(in: window, terms: hideMyEmailDescriptions) != nil ||
    findButton(in: window, titles: createButtonTitles) != nil ||
    findSheetContainingButton(in: window, titles: continueButtonTitles) != nil
}

@discardableResult
func openICloudPaneViaURL() -> Bool {
    guard let url = URL(string: iCloudURL), NSWorkspace.shared.open(url) else {
        return false
    }

    return waitUntil(timeout: launchTimeout) {
        activateSystemSettings()
        return iCloudWindow() != nil
    }
}

func ensureICloudPane() {
    ensureSystemSettingsWindow()

    if let currentICloudWindow = iCloudWindow() {
        if iCloudWindowReadyToContinue(currentICloudWindow) {
            activateSystemSettings()
            return
        }

        terminateSystemSettingsIfRunning()
        ensureSystemSettingsWindow()
    }

    if openICloudPaneViaURL() {
        return
    }

    terminateSystemSettingsIfRunning()
    ensureSystemSettingsWindow()
    activateSystemSettings()
}

func findButton(
    in element: AXUIElement,
    titles: [String] = [],
    descriptions: [String] = []
) -> AXUIElement? {
    walkElements(startingAt: element) { candidate in
        guard (strAttr(candidate, kAXRoleAttribute) ?? "") == (kAXButtonRole as String) else {
            return nil
        }

        let title = strAttr(candidate, kAXTitleAttribute) ?? ""
        let description = strAttr(candidate, kAXDescriptionAttribute) ?? ""

        if titles.contains(where: { !title.isEmpty && title.contains($0) }) {
            return candidate
        }

        if descriptions.contains(where: { !description.isEmpty && description.contains($0) }) {
            return candidate
        }

        return nil
    }
}

func findSheetContainingButton(in element: AXUIElement, titles: [String]) -> AXUIElement? {
    walkElements(startingAt: element) { candidate in
        guard (strAttr(candidate, kAXRoleAttribute) ?? "") == (kAXSheetRole as String) else {
            return nil
        }

        return findButton(in: candidate, titles: titles) != nil ? candidate : nil
    }
}

func findEmailText(in element: AXUIElement) -> String? {
    walkElements(startingAt: element) { candidate in
        let value = strAttr(candidate, kAXValueAttribute) ?? ""
        return value.contains("@icloud.com") ? value : nil
    }
}

func findTextField(in element: AXUIElement) -> AXUIElement? {
    walkElements(startingAt: element) { candidate in
        let role = strAttr(candidate, kAXRoleAttribute) ?? ""
        return role == (kAXTextFieldRole as String) || role == "AXSecureTextField" ? candidate : nil
    }
}

func findSecureTextField(in element: AXUIElement) -> AXUIElement? {
    walkElements(startingAt: element) { candidate in
        (strAttr(candidate, kAXRoleAttribute) ?? "") == "AXSecureTextField" ? candidate : nil
    }
}

func hasProgressIndicator(in element: AXUIElement) -> Bool {
    walkElements(startingAt: element) { candidate in
        (strAttr(candidate, kAXRoleAttribute) ?? "") == (kAXProgressIndicatorRole as String) ? true : nil
    } ?? false
}

func normalizedText(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
}

func containsAnyTerm(title: String, description: String, value: String, terms: [String]) -> Bool {
    let haystacks = [normalizedText(title), normalizedText(description), normalizedText(value)]
    return terms.contains { term in
        let normalizedTerm = normalizedText(term)
        return haystacks.contains(where: { !$0.isEmpty && $0.contains(normalizedTerm) })
    }
}

func elementContainsTerms(in element: AXUIElement, terms: [String]) -> Bool {
    walkElements(startingAt: element) { candidate in
        let title = strAttr(candidate, kAXTitleAttribute) ?? ""
        let description = strAttr(candidate, kAXDescriptionAttribute) ?? ""
        let value = strAttr(candidate, kAXValueAttribute) ?? ""
        return containsAnyTerm(title: title, description: description, value: value, terms: terms) ? true : nil
    } ?? false
}

func hasButton(in element: AXUIElement, titles: [String]) -> Bool {
    findButton(in: element, titles: titles) != nil
}

func findPasswordPrompt(in element: AXUIElement) -> AXUIElement? {
    walkElements(startingAt: element) { candidate in
        let role = strAttr(candidate, kAXRoleAttribute) ?? ""
        guard role == (kAXSheetRole as String) || role == (kAXWindowRole as String) else {
            return nil
        }
        guard findEmailText(in: candidate) == nil else {
            return nil
        }
        guard hasButton(in: candidate, titles: cancelButtonTitles) else {
            return nil
        }
        guard hasButton(in: candidate, titles: passwordContinueButtonTitles) else {
            return nil
        }
        guard findSecureTextField(in: candidate) != nil || findTextField(in: candidate) != nil else {
            return nil
        }
        guard elementContainsTerms(in: candidate, terms: passwordPromptStrongTerms)
            || elementContainsTerms(in: candidate, terms: passwordPromptTerms) else {
            return nil
        }
        return candidate
    }
}

func findHideMyEmailManager(in element: AXUIElement) -> AXUIElement? {
    walkElements(startingAt: element) { candidate in
        let role = strAttr(candidate, kAXRoleAttribute) ?? ""
        guard role == (kAXSheetRole as String) || role == (kAXWindowRole as String) else {
            return nil
        }
        guard hasButton(in: candidate, titles: doneButtonTitles) else {
            return nil
        }
        return elementContainsTerms(in: candidate, terms: hideMyEmailDescriptions) ? candidate : nil
    }
}

func anyPasswordPrompt() -> AXUIElement? {
    for window in systemSettingsWindows() {
        if let prompt = findPasswordPrompt(in: window) {
            return prompt
        }
    }
    return nil
}

func anyHideMyEmailManager() -> AXUIElement? {
    for window in systemSettingsWindows() {
        if let manager = findHideMyEmailManager(in: window) {
            return manager
        }
    }
    return nil
}

func findPressableElement(in element: AXUIElement, terms: [String]) -> AXUIElement? {
    walkElements(startingAt: element) { candidate in
        let role = strAttr(candidate, kAXRoleAttribute) ?? ""
        if role == (kAXApplicationRole as String)
            || role == "AXMenuBar"
            || role == "AXMenuBarItem"
            || role == "AXMenu"
            || role == "AXMenuItem" {
            return nil
        }

        let title = strAttr(candidate, kAXTitleAttribute) ?? ""
        let description = strAttr(candidate, kAXDescriptionAttribute) ?? ""
        let value = strAttr(candidate, kAXValueAttribute) ?? ""
        guard containsAnyTerm(title: title, description: description, value: value, terms: terms) else {
            return nil
        }

        var current: AXUIElement? = candidate
        for _ in 0..<6 {
            guard let currentElement = current else {
                break
            }

            let currentRole = strAttr(currentElement, kAXRoleAttribute) ?? ""
            if currentRole == "AXMenuBar"
                || currentRole == "AXMenuBarItem"
                || currentRole == "AXMenu"
                || currentRole == "AXMenuItem" {
                break
            }

            let actions = actionNames(of: currentElement)
            if actions.contains(kAXPressAction as String) {
                return currentElement
            }
            current = parent(of: currentElement)
        }

        return nil
    }
}

func interestingElementSummaries(in element: AXUIElement) -> [String] {
    var seen = Set<String>()
    var summaries: [String] = []

    _ = walkElements(startingAt: element) { candidate in
        let role = strAttr(candidate, kAXRoleAttribute) ?? ""
        if role == (kAXApplicationRole as String) || role.hasPrefix("AXMenu") {
            return nil
        }
        let title = strAttr(candidate, kAXTitleAttribute) ?? ""
        let description = strAttr(candidate, kAXDescriptionAttribute) ?? ""
        let value = strAttr(candidate, kAXValueAttribute) ?? ""
        guard !title.isEmpty || !description.isEmpty || !value.isEmpty else {
            return nil
        }

        let summary = "role=\(role) title=\(title) desc=\(description) value=\(value)"
        guard !summary.isEmpty, !seen.contains(summary) else {
            return nil
        }

        seen.insert(summary)
        summaries.append(summary)
        return nil
    } as Never?

    return summaries
}

func press(_ element: AXUIElement, context: String) {
    let result = AXUIElementPerformAction(element, kAXPressAction as CFString)
    guard result == .success else {
        let role = strAttr(element, kAXRoleAttribute) ?? "<unknown>"
        let title = strAttr(element, kAXTitleAttribute) ?? ""
        let description = strAttr(element, kAXDescriptionAttribute) ?? ""
        let actions = actionNames(of: element).joined(separator: ",")
        fail("AXPress failed for \(context): \(result.rawValue); role=\(role) title=\(title) desc=\(description) actions=\(actions)")
    }
}

func clickCenter(of element: AXUIElement, context: String) {
    guard let origin = cgPointAttr(element, kAXPositionAttribute),
          let size = cgSizeAttr(element, kAXSizeAttribute) else {
        fail("failed to resolve click target geometry for \(context)")
    }

    let center = CGPoint(x: origin.x + (size.width / 2), y: origin.y + (size.height / 2))
    let source = CGEventSource(stateID: .hidSystemState)

    guard let move = CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: center, mouseButton: .left),
          let down = CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: center, mouseButton: .left),
          let up = CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: center, mouseButton: .left) else {
        fail("failed to synthesize mouse click for \(context)")
    }

    move.post(tap: .cghidEventTap)
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
}

func setText(_ value: String, in element: AXUIElement, context: String) {
    let result = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, value as CFTypeRef)
    guard result == .success else {
        fail("failed to set \(context): \(result.rawValue)")
    }
}

func postKey(_ keyCode: CGKeyCode, flags: CGEventFlags = []) {
    let source = CGEventSource(stateID: .hidSystemState)

    guard let keyDown = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true),
          let keyUp = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false) else {
        fail("failed to post key event for keyCode \(keyCode)")
    }

    keyDown.flags = flags
    keyDown.post(tap: .cghidEventTap)

    keyUp.flags = flags
    keyUp.post(tap: .cghidEventTap)
}

func typeUnicode(_ text: String) {
    let source = CGEventSource(stateID: .hidSystemState)

    for scalar in text.utf16 {
        var value = scalar

        guard let keyDown = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true),
              let keyUp = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false) else {
            fail("failed to post Unicode key events")
        }

        keyDown.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value)
        keyDown.post(tap: .cghidEventTap)

        keyUp.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value)
        keyUp.post(tap: .cghidEventTap)
    }
}

func fillTextField(_ value: String, in element: AXUIElement, context: String, verifyObservedValue: Bool = true) {
    setText(value, in: element, context: context)
    if !verifyObservedValue || (strAttr(element, kAXValueAttribute) ?? "") == value {
        return
    }

    let focusResult = AXUIElementSetAttributeValue(element, kAXFocusedAttribute as CFString, kCFBooleanTrue)
    guard focusResult == .success else {
        fail("failed to focus \(context): \(focusResult.rawValue)")
    }

    RunLoop.current.run(until: Date().addingTimeInterval(0.2))
    postKey(0, flags: .maskCommand)
    RunLoop.current.run(until: Date().addingTimeInterval(0.1))
    postKey(51)
    RunLoop.current.run(until: Date().addingTimeInterval(0.1))
    typeUnicode(value)

    guard waitUntil(timeout: 2, {
        (strAttr(element, kAXValueAttribute) ?? "") == value
    }) else {
        fail("typed \(context) but did not observe the expected value")
    }
}

func resolvePasswordPromptIfPresent(startingFrom window: AXUIElement) -> Bool {
    guard let prompt = findPasswordPrompt(in: window) ?? anyPasswordPrompt() else {
        return false
    }

    guard !appleIDPassword.isEmpty else {
        fail("Apple ID password prompt appeared, but HIDDEN_MAIL_APPLE_ID_PASSWORD is not configured")
    }

    guard let passwordField = findSecureTextField(in: prompt) ?? findTextField(in: prompt) else {
        fail("Apple ID password prompt appeared, but no password field was found")
    }
    fillTextField(appleIDPassword, in: passwordField, context: "Apple ID password", verifyObservedValue: false)

    guard let continueButton = findButton(in: prompt, titles: passwordContinueButtonTitles)
            ?? findPressableElement(in: prompt, terms: passwordContinueButtonTitles) else {
        fail("Apple ID password prompt appeared, but no continue button was found")
    }
    press(continueButton, context: "Apple ID password continue button")

    guard waitUntil(timeout: transitionTimeout, {
        anyPasswordPrompt() == nil
    }) else {
        fail("timed out waiting for Apple ID password prompt to dismiss")
    }

    return true
}

func waitForSettingsState(
    timeout: TimeInterval = transitionTimeout,
    ready: @escaping (AXUIElement) -> Bool
) -> AXUIElement? {
    var matchedWindow: AXUIElement?
    let succeeded = waitUntil(timeout: timeout) {
        guard let refreshed = preferredSystemSettingsWindow() else {
            return false
        }
        activateSystemSettings()

        if ready(refreshed) {
            matchedWindow = refreshed
            return true
        }

        if resolvePasswordPromptIfPresent(startingFrom: refreshed) {
            return false
        }

        _ = hasProgressIndicator(in: refreshed)
        return false
    }

    return succeeded ? matchedWindow : nil
}

func ensureHideMyEmailManager(startingFrom window: AXUIElement) -> AXUIElement {
    if let readyWindow = waitForSettingsState(timeout: 1, ready: { refreshed in
        findButton(in: refreshed, titles: createButtonTitles) != nil ||
        findSheetContainingButton(in: refreshed, titles: continueButtonTitles) != nil
    }) {
        return readyWindow
    }

    var currentWindow = window

    for attempt in 1...transitionAttempts {
        if let hideButton = findPressableElement(in: currentWindow, terms: hideMyEmailDescriptions) {
            press(hideButton, context: "Hide My Email entry (attempt \(attempt))")

            if let readyWindow = waitForSettingsState(ready: { refreshed in
                findButton(in: refreshed, titles: createButtonTitles) != nil ||
                findSheetContainingButton(in: refreshed, titles: continueButtonTitles) != nil
            }) {
                return readyWindow
            }
        } else if let navigationTarget = findPressableElement(in: currentWindow, terms: accountNavigationTerms) {
            press(navigationTarget, context: "iCloud navigation fallback (attempt \(attempt))")

            if let readyWindow = waitForSettingsState(ready: { refreshed in
                findPressableElement(in: refreshed, terms: hideMyEmailDescriptions) != nil ||
                findButton(in: refreshed, titles: createButtonTitles) != nil ||
                findSheetContainingButton(in: refreshed, titles: continueButtonTitles) != nil
            }) {
                currentWindow = readyWindow
                continue
            }
        } else {
            let availableElements = interestingElementSummaries(in: currentWindow).joined(separator: " | ")
            fail("failed to find Hide My Email entry in iCloud pane; available elements: \(availableElements)")
        }

        guard let refreshed = preferredSystemSettingsWindow() else {
            break
        }
        currentWindow = refreshed
    }

    fail("timed out waiting for Hide My Email manager after \(transitionAttempts) attempts; \(currentWindowDiagnostics())")
}

func ensureCreateSheet(startingFrom window: AXUIElement) -> AXUIElement {
    if let readyWindow = waitForSettingsState(timeout: 1, ready: { refreshed in
        findSheetContainingButton(in: refreshed, titles: continueButtonTitles) != nil
    }) {
        return readyWindow
    }

    var currentWindow = window

    for attempt in 1...transitionAttempts {
        guard let createButton = findButton(in: currentWindow, titles: createButtonTitles) else {
            fail("failed to find create-address button")
        }
        press(createButton, context: "Create new Hide My Email address (attempt \(attempt))")

        if let readyWindow = waitForSettingsState(ready: { refreshed in
            findSheetContainingButton(in: refreshed, titles: continueButtonTitles) != nil
        }) {
            return readyWindow
        }

        guard let refreshed = preferredSystemSettingsWindow() else {
            break
        }
        currentWindow = refreshed
    }

    fail("timed out waiting for create-address sheet after \(transitionAttempts) attempts")
}

func dismissHideMyEmailManager(_ window: AXUIElement) {
    _ = window

    func managerDismissedGlobally() -> Bool {
        anyPasswordPrompt() == nil && anyHideMyEmailManager() == nil
    }

    func waitForManagerToSettle(timeout: TimeInterval = transitionTimeout) {
        _ = waitUntil(timeout: timeout) {
            activateSystemSettings()
            if let promptWindow = preferredSystemSettingsWindow(), resolvePasswordPromptIfPresent(startingFrom: promptWindow) {
                return false
            }

            guard let manager = anyHideMyEmailManager() else {
                return false
            }

            return !hasProgressIndicator(in: manager)
        }
    }

    func waitForDismissal(timeout: TimeInterval = transitionTimeout) -> Bool {
        waitUntil(timeout: timeout) {
            activateSystemSettings()
            if let promptWindow = preferredSystemSettingsWindow(), resolvePasswordPromptIfPresent(startingFrom: promptWindow) {
                return false
            }

            return managerDismissedGlobally()
        }
    }

    if resolvePasswordPromptIfPresent(startingFrom: window) {
        guard anyHideMyEmailManager() != nil else {
            return
        }
        dismissHideMyEmailManager(window)
        return
    }

    waitForManagerToSettle()

    if let manager = anyHideMyEmailManager(),
       let doneButton = findButton(in: manager, titles: doneButtonTitles) {
        press(doneButton, context: "Hide My Email done button")
        if waitForDismissal() {
            return
        }
    }

    if let manager = anyHideMyEmailManager(),
       let retryDoneButton = findButton(in: manager, titles: doneButtonTitles) {
        press(retryDoneButton, context: "Hide My Email done button retry")
        if waitForDismissal() {
            return
        }
    }

    if let manager = anyHideMyEmailManager(),
       let windowCloseButton = closeButton(of: manager) {
        press(windowCloseButton, context: "Hide My Email close button")
        if waitForDismissal() {
            return
        }
    }

    activateSystemSettings()
    postKey(13, flags: .maskCommand)

    guard waitForDismissal() else {
        fail("failed to dismiss Hide My Email manager")
    }
}

ensureICloudPane()
activateSystemSettings()

guard let initialWindow = preferredSystemSettingsWindow() else {
    fail("missing System Settings window after opening pane")
}

let managerWindow = ensureHideMyEmailManager(startingFrom: initialWindow)
let createSheetWindow = ensureCreateSheet(startingFrom: managerWindow)

guard let createSheet = findSheetContainingButton(in: createSheetWindow, titles: continueButtonTitles) else {
    fail("failed to locate create-address sheet")
}

guard let relayEmail = findEmailText(in: createSheet) else {
    fail("failed to read the newly generated Hide My Email relay address")
}

guard let labelField = findTextField(in: createSheet) else {
    fail("failed to locate the Hide My Email label field")
}
fillTextField(label, in: labelField, context: "Hide My Email label")

var completedWindow: AXUIElement?
for attempt in 1...transitionAttempts {
    guard let refreshedWindow = preferredSystemSettingsWindow(),
          let refreshedCreateSheet = findSheetContainingButton(in: refreshedWindow, titles: continueButtonTitles),
          let continueButton = findButton(in: refreshedCreateSheet, titles: continueButtonTitles) else {
        fail("failed to locate the create-address continue button")
    }

    press(continueButton, context: "Create-address continue button (attempt \(attempt))")

    if let closedWindow = waitForSettingsState(ready: { refreshed in
        findSheetContainingButton(in: refreshed, titles: continueButtonTitles) == nil
    }) {
        completedWindow = closedWindow
        break
    }
}

guard let completedWindow else {
    fail("timed out waiting for create-address sheet to close")
}

dismissHideMyEmailManager(completedWindow)

print(relayEmail)
