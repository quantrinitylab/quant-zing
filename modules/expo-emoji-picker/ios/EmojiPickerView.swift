import ExpoModulesCore
import MCEmojiPicker

class EmojiPickerView: ExpoView, MCEmojiPickerDelegate {
  let onEmojiSelected = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    let tapGesture = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
    self.addGestureRecognizer(tapGesture)
  }

  @objc func handleTap(_ gesture: UITapGestureRecognizer) {
    presentEmojiPicker()
  }

  func presentEmojiPicker() {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      guard let rootVC = self.findViewController() else { return }
      var presentingVC = rootVC
      while let presented = presentingVC.presentedViewController, !presented.isBeingDismissed {
        presentingVC = presented
      }

      let emojiPicker = MCEmojiPickerViewController()
      emojiPicker.sourceView = self
      emojiPicker.delegate = self
      emojiPicker.arrowDirection = self.preferredArrowDirection()
      presentingVC.present(emojiPicker, animated: true)
    }
  }

  private func findViewController() -> UIViewController? {
    var responder: UIResponder? = self.next
    while let current = responder {
      if let vc = current as? UIViewController {
        return vc
      }
      responder = current.next
    }
    return self.window?.rootViewController
  }

  /// If the trigger sits in the bottom third of the screen there isn't enough
  /// room below it for a usable popover, so anchor the picker above instead.
  private func preferredArrowDirection() -> MCPickerArrowDirection {
    guard let window = self.window else { return .up }
    let frameInWindow = self.convert(self.bounds, to: window)
    let threshold = window.bounds.height * (2.0 / 3.0)
    return frameInWindow.midY >= threshold ? .down : .up
  }

  func didGetEmoji(emoji: String) {
    onEmojiSelected([
      "emoji": emoji
    ])
  }
}
