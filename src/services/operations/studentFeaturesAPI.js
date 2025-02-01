import toast from "react-hot-toast";
import { studentEndpoints } from "../apis";
import { apiConnector } from "../apiconnector";
import rzpLogo from "../../assets/Logo/rzp_logo.png";
import { setPaymentLoading } from "../../slices/courseSlice";
import { resetCart } from "../../slices/cartSlice";

const { COURSE_PAYMENT_API, COURSE_VERIFY_API, SEND_PAYMENT_SUCCESS_EMAIL_API } = studentEndpoints;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;

    script.onload = () => {
      resolve(true);
    };
    script.onerror = () => {
      reject(false);
    };
    document.body.appendChild(script);
  });
}
//
export async function buyCourse(token, courses, userDetails, navigate, dispatch) {
    const toastId = toast.loading("Loading..");
    try {
      // Load Razorpay SDK
      const scriptLoaded = await loadScript("https://checkout.razorpay.com/v1/checkout.js");
  
      if (!scriptLoaded) {
        toast.error("RazorPay SDK failed to load");
        return;
      }
  
      // Get order details from backend
      const orderResponse = await apiConnector(
        "POST",
        COURSE_PAYMENT_API,
        { courses },
        { Authorization: `Bearer ${token}` }
      );
  
      // Log response for debugging
      console.log("orderResponse:", orderResponse);
  
      // Check if the response data and the nested data exist
      if (!orderResponse.data || !orderResponse.data.data || !orderResponse.data.data.amount || !orderResponse.data.data.currency || !orderResponse.data.data.id) {
        throw new Error("Order data is missing in the response");
      }
  
      // Destructure the order response directly from data.data
      const { amount, currency, id: orderId } = orderResponse.data.data;
  
      // Configure Razorpay payment options
      const options = {
        key: process.env.REACT_APP_RAZORPAY_KEY,  // Razorpay API Key
        currency: currency,
        amount: `${amount}`,  // Amount in paise (not rupees)
        order_id: orderId,  // Razorpay order ID
        name: "StudyNotion",
        description: "Thank You for Purchasing the Course",
        image: rzpLogo,
        prefill: {
          name: `${userDetails.firstName}`,
          email: userDetails.email,
        },
        handler: function (response) {
          sendPaymentSuccessEmail(response, amount, token);
          verifyPayment({ ...response, courses }, token, navigate, dispatch);
        },
      };
  
      // Open Razorpay payment window
      const paymentObject = new window.Razorpay(options);
      paymentObject.open();
      paymentObject.on("payment.failed", function (response) {
        toast.error("Oops, payment failed");
        console.log(response.error);
      });
    } catch (error) {
      console.error("PAYMENT API ERROR.....", error);
      toast.error("Could not make Payment");
    }
    toast.dismiss(toastId);
  }
  

//

async function sendPaymentSuccessEmail(response, amount, token) {
  try {
    await apiConnector(
      "POST",
      SEND_PAYMENT_SUCCESS_EMAIL_API,
      {
        orderId: response.razorpay_order_id,
        paymentId: response.razorpay_payment_id,
        amount,
      },
      { Authorization: `Bearer ${token}` }
    );
  } catch (error) {
    console.error("PAYMENT SUCCESS EMAIL ERROR....", error);
  }
}

async function verifyPayment(bodyData, token, navigate, dispatch) {
  const toastId = toast.loading("Verifying Payment....");
  dispatch(setPaymentLoading(true));
  try {
    const response = await apiConnector(
      "POST",
      COURSE_VERIFY_API,
      bodyData,
      { Authorization: `Bearer ${token}` }
    );

    if (!response.data.success) {
      throw new Error(response.data.message);
    }

    toast.success("Payment Successful, You are added to the course");
    navigate("/dashboard/enrolled-courses");
    dispatch(resetCart());
  } catch (error) {
    console.error("PAYMENT VERIFY ERROR....", error);
    toast.error("Could not verify Payment");
  }
  toast.dismiss(toastId);
  dispatch(setPaymentLoading(false));
}
