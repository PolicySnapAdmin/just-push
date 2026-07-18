# Push Thru — iOS (Capacitor)

Scaffolded on Windows. **Build and archive on a Mac with Xcode.**

## First time on Mac

```bash
cd just-push
npm install
npm run build
npx cap sync ios
cd ios/App
pod install   # if CocoaPods prompts / needed
cd ../..
npx cap open ios
```

Or: `npm run cap:ios`

## Xcode checklist

1. Open `App` target → **Signing & Capabilities** → select your Team  
2. Confirm Bundle ID: `com.calvinmoney.pushthru`  
3. Set display name **Push Thru**  
4. Drop in 1024 App Store icon (Asset Catalog)  
5. Run on Simulator or device  
6. **Product → Archive** → distribute to TestFlight  

## After web changes

```bash
npm run cap:sync
# or
npm run build && npx cap sync ios
```

## Notes

- Web assets live in `www/` (generated) and are copied into `ios/App/App/public/`  
- CocoaPods was skipped on Windows; Mac runs `pod install` as needed  
- Support: calvin.money@gmail.com  
