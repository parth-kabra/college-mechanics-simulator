# Moment of a Force Lab

An interactive mechanics learning app built to visualize and solve the classic problem of finding the moment of a force about points O and P in a half-disk setup.

This project turns a textbook problem into a live, explorable simulation with:

- a 3D interactive force diagram
- symbolic and numeric input handling
- live moment calculations
- a step-by-step derivation with LaTeX output
- responsive UI for desktop and mobile

## Project overview

The app models a force T applied at point A on a half-disk, with radius r and angular parameters:

- T = applied force magnitude
- r = radius / lever arm distance
- θ = angle of the radius arm from the horizontal
- α = angle of the force direction from the x-axis

It computes the moment of the force about:

- O (origin)
- P (point on the ground line below the circumference)

The application also shows direction and sign convention:

- counterclockwise is treated as positive internally
- results are reported as CW/CCW
- symbolic inputs are supported for general-case derivation

## Features

### Interactive 3D visualization
- Orbit, zoom, and inspect the setup from different views
- Toggle layers such as components, moment arms, angle arcs, moment arrows, dim lines, and labels
- Auto-rotate option for presentation mode

### Input controls
- Numeric input for T, r, θ, and α
- Symbolic input support (for example F or φ)
- Slider controls for quick adjustment
- Reset and general-case modes

### Calculation engine
- Validates and clamps numeric ranges
- Solves moment equations using vector/cross-product logic
- Verifies numeric answers against closed-form expressions
- Displays computed results for both O and P

### Step-by-step explanation
- Builds the geometry of the setup
- Resolves force components into x and y directions
- Shows derivation for moments about O and P
- Renders equations with MathJax

## File structure

```text
mechanics/
├── index.html      # Entry page and CDN script setup
├── index.css       # Dark themed styling and responsive layout
├── index.js        # Physics simulation, rendering, and UI logic
├── README.md       # Project documentation
└── problem.png     # Problem reference image (if present in the project folder)
```

## How to run

### Option 1: open directly
Open `index.html` in a browser.

### Option 2: local server
From the project folder, run a local static server, for example:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## Tech stack

- HTML5
- CSS3
- JavaScript (vanilla)
- Three.js for 3D diagram rendering
- MathJax for LaTeX-style equations
- Google Fonts (Poppins)

## Problem context

This app is designed around the mechanics problem: determining the moment of tension T about points O and P for a half-disk arrangement. The simulation is educational and intended to help students understand:

- force components
- moment arms
- sign conventions
- geometry-based problem solving
- verification of analytical results

## Usage notes

- Use numeric values for direct calculations.
- Use symbolic values when teaching or solving a general expression.
- Negative T values reverse the force direction.
- Angles are entered in degrees.
- Results update immediately as inputs change.

## Example formulas used

The app computes moments based on the geometry and vector relationships:

- Moment about O: `M_O = T r sin(α + θ)`
- Moment about P: `M_P = T r [cos α + sin(α + θ)]`

These are displayed and verified in the UI with the live and symbolic derivations.

## Author / metadata

- Student: Parth Kabra
- SRN: PES1UG26AM238
- Portfolio: https://parthkabra.vercel.app/
- GitHub: https://github.com/parth-kabra/college-mechanics-simulator/

## License

This project is a personal educational project and is provided for learning and demonstration purposes.
"# college-mechanics-simulator" 
"# college-mechanics-simulator" 
"# college-mechanics-simulator" 
