import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";

const registerUser = asyncHandler(async (req, res) => {

    /* 
    1) get user details from frontend
    2) validation - not empty
    3) check if user already exists
    4)check  for images , check for avatar
    5) upload them to cloudinary
    6) create user object - create entry in db
    7) remove password and refresh token field from response
    8) check for user creation
    9) return the response
    */

    const {fullName, email, userName, password} = req.body

    
    if([fullName, email, userName, password].some( (field) => field?.trim() === "" )){
        throw new ApiError(400, "All fields are required")
    }


    const existedUser = User.findOne( {
        $or: [{ userName }, { email }]
    } )
    if(existedUser){
        throw new ApiError(409, "User already exists on this email or userName")
    }


    const avatarLocalPath = req.files?.avatar[0]?.path
    const coverImageLocalPath = req.files?.coverImage[0]?.path
    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required")
    }


    const avatar = await uploadCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if(!avatar){
        throw new ApiError(400, "Avatar file is required")
    }


    const user = await User.create({
        fullName,
        email,
        userName: userName.toLowerCase(),
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        password
    })


    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )


    if(!createdUser){
        throw new ApiError(500, "User creation failed on server side")
    }


    return res.status(201).json(
        new ApiResponse(
            200,
            createdUser,
            "User is created successfully"
        )
    )
})

export {
    registerUser
}