import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshToken = async(userId) =>{
    try{
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})

        return {accessToken, refreshToken}

    } catch(error){
        throw new ApiError(500, "Something went wrong while generating access and refresh token")
    }
}

//Register user authentication
const registerUser = asyncHandler(async (req, res) => {

    //1) get user details from frontend
    const {fullName, email, userName, password} = req.body

    //2) validation - not empty
    if([fullName, email, userName, password].some( (field) => field?.trim() === "" )){
        throw new ApiError(400, "All fields are required")
    }

    //3) check if user already exists
    const existedUser = await User.findOne( {
        $or: [{ userName }, { email }]
    } )
    if(existedUser){
        throw new ApiError(409, "User already exists on this email or userName")
    }

    //4)check  for avatar and check for cover image
    const avatarLocalPath = req.files?.avatar[0]?.path
    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required")
    }
    //const coverImageLocalPath = req.files?.coverImage[0]?.path
    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path
    }


    //5) upload them to cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if(!avatar){
        throw new ApiError(400, "Avatar file is required")
    }

    //6) create user object - create entry in db
    const user = await User.create({
        fullName,
        email,
        userName: userName.toLowerCase(),
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        password
    })

    //7) remove password and refresh token field from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    //8) check for user creation
    if(!createdUser){
        throw new ApiError(500, "User creation failed on server side")
    }

    //9) return the response
    return res.status(201).json(
        new ApiResponse(
            200,
            createdUser,
            "User is created successfully"
        )
    )
})


//Login user authentication
const loginUser = asyncHandler( async (req, res) => {
    // 1. get user details from frontend
    // 2. userName/email
    // 3. find the user
    // 4. password check
    // 5. generate access token and refresh token
    // 6. send cookies

     // 1. get user details from frontend
     const {email, userName, password} = req.body

     // 2. userName/email
    if(!email && !userName){
        throw new ApiError(400, "email or userName is required")
    }

    // 3. find the user
    const user = await User.findOne({
        $or: [{email}, {userName}]
    })
    if(!user){
        throw new ApiError(404, "User not found")
    }

    // 4. password check
    const isPasswordValid = await user.isPasswordCorrect(password)
    if(!isPasswordValid){
        throw new ApiError(401, "Invalid user credentials")
    }

    // 5. generate access token and refresh token
    const{accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id)

    // 6. send cookies
    const loggedInUser = await User.findById(user._id).select("-passworrd -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,{
                user: loggedInUser, accessToken, refreshToken
            },
            "User logged in successfully"
        )
    )
})

//Logout user
const logoutUser = asyncHandler(async(req, res) => {
    await User.findByIdAndUpdate(req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )
    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken"), options
    .json(
        new ApiResponse(200, {}, "User logged out successfully")
    ) 
})

//Refresh the access token of user using refresh token
const refreshAccessToken = asyncHandler( async(req, res) => {
    const incomingRefreshToken = req.cookie.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id)
    
        if(!user){
            throw new ApiError(401, "Invalid refresh token")
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh token is expired")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const{accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id)
    
        return res.status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})


export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken
}