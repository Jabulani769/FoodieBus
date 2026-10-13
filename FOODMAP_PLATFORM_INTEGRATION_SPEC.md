# FOODMAP PLATFORM INTEGRATION SPECIFICATION

Web Dashboard Features & Mobile App Data Flow

## 1. CATEGORY MANAGEMENT

### Web Dashboard (Restaurant Owner)

- **Pre-existing Category Selection:** Existing platform-wide categories (e.g., Burgers, Pizza, Drinks, Desserts, Asian, Halal) are accessible through a searchable dropdown to maintain system consistency.
- **Custom Category Creation:** Owners can type a brand-new name to generate a fresh product category dynamically if it does not yet exist.
- **Ordering & Active Status:** Supports drag-and-drop structural sorting or toggling visibility to 'Inactive' (e.g., hiding a breakfast menu after 11:00 AM).

### Mobile App (Customer Experience)

- **Home Screen Selector:** A horizontal sliding selector on the home screen dynamically displays distinct active categories.
- **Filtering:** Selecting a category filters the general feed to reveal only kitchens or restaurants serving those specific categories.
- **In-Store Menu View:** Individual store pages cleanly list food offerings under distinct category headers according to the owner's chosen sort order.

## 2. MENU ITEM BUILDER & CUSTOMIZATIONS

### Web Dashboard (Restaurant Owner)

- **Core Item Details:** Fields for Item Name ('Cheeseburger Deluxe'), Description, Base Price, and dedicated media upload.
- **Required Selection:** Enforces mandatory single-choice selections via radio elements (e.g., Choice of Patty: Single +$0.00, Double +$2.50).
- **Optional Selections:** Allows multi-choice checkboxes for voluntary add-ons (e.g., Extra Toppings: Extra Cheese +$1.00, Extra Bacon +$1.50).
- **Live Stock Toggle:** A fast master switch next to each dish to instantly flag it as available or out of stock.

### Mobile App (Customer Experience)

- **Menu Card Display:** Shows food cards containing the item image, clear naming, short description, and starting base price.
- **Customization Sheet:** Displays an overlay sheet showing all customizable variations. Customers are strictly forced to settle mandatory selections before clicking 'Add to Cart'. It dynamically totals customization costs in real-time.
- **Out of Stock Behavior:** Flipping an item to 'Out of Stock' on the web immediately applies an 'Unavailable Today' badge over the target menu card, locking item selections.

## 3. REAL-TIME ORDER MANAGEMENT (KDS)

### Web Dashboard (Restaurant Owner)

- **Live Kitchen Display System (KDS):** A dedicated workflow terminal monitoring incoming orders in real-time, accompanied by loud audible notifications.
- **Order Processing Actions:** Owners inspect line-items and click 'Accept & Start Preparing' while picking a realistic fulfillment window (e.g., 15 mins, 30 mins).
- **Completion Workflow:** Kitchen workers flag orders as 'Mark Ready for Pickup/Delivery' when boxing or bagging is finalized.

### Mobile App (Customer Experience)

- **Live Order Tracker:** Customer's app monitors order progression in real-time without screen refreshes: Pending ('Waiting for restaurant confirmation...'), Accepted ('Kitchen is preparing your order'), or Ready ('Your food is ready! Driver is on the way.').

## 4. OPERATING HOURS & STORE STATUS

### Web Dashboard (Restaurant Owner)

- **Weekly Operating Schedule:** Precise daily grids defining exact operational spans (e.g., Mon–Fri: 10:00 AM – 10:00 PM).
- **Emergency Pause Switch:** A panic toggle to instantly suspend all incoming platform ticket requests during heavy kitchen rushes.

### Mobile App (Customer Experience)

- **Store Badging:** Renders an apparent 'Currently Closed' or 'Busy - Not Accepting Orders' alert whenever operations are turned off or paused.
- **Cart Restriction:** Customers can freely browse menus, but 'Add to Cart' and checkout pipelines are systematically locked.

## 5. LOCATION & DELIVERY RADIUS SETUP

### Web Dashboard (Restaurant Owner)

- **Map Pin Coordinates:** Owners place an exact pin marker across an interactive map to commit their latitude, longitude, verified phone lines, and postal address fields.
- **Delivery Radius Limit:** Owners explicitly define their strict delivery limits in kilometers (e.g., Within 5 km).

### Mobile App (Customer Experience)

- **Geofencing & Distance Calculation:** Evaluates the direct distance from the user's live device coordinates to the restaurant's stored coordinate variables.
- **Filtered Feed:** Customers sitting safely within the designated boundary see the kitchen listed with exact distance meters and ETA metrics (e.g., 1.2 km away • 15–20 min). Accounts sitting outside the radius threshold are dynamically hidden.
