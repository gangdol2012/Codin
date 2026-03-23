// A simple A+B program using prompt for browser-compatible input
const input = prompt("Enter two numbers (e.g., 5 10):");

if (input) {
  const nums = input.trim().split(/\s+/).map(Number);
  if (nums.length >= 2) {
    const result = nums[0] + nums[1];
    console.log(result);
    console.log("Result: " + result);
  } else {
    console.log("Please enter at least two numbers.");
  }
}
